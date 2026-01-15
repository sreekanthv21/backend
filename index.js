const express = require('express');
const cors= require('cors');
const nodemailer=require('nodemailer');
const admin=require('firebase-admin');

const { CloudTasksClient } = require("@google-cloud/tasks");
const { DateTime } = require("luxon");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {S3Client, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { Timestamp } = require('firebase-admin/firestore');

const app= express();
app.use(cors());
app.use(express.json());

const tasksClient=new CloudTasksClient(
    {credentials: JSON.parse(process.env.cloudtaskkey)}
);

const serviceAccount = JSON.parse(process.env.firebasejson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const mailer=nodemailer.createTransport({
    service:'gmail',
    auth:{
        user:'learn@lawtus.in',
        pass:'kttb kbyz zbpx mklu'
    }
})

const s3 = new S3Client({
  credentials:{
        accessKeyId: process.env.key,
        secretAccessKey: process.env.access
    },
  endpoint: "https://s3.ap-southeast-1.wasabisys.com",
  region: "ap-southeast-1",
  
  forcePathStyle: true,
});

const streamtostring = async (stream)=>{
    let chunks=[];
    try{
        for await(const chunk of stream){
            chunks.push(chunk);
        }
        return Buffer.concat(chunks).toString("utf-8");
        
    }catch(e){
        console.log(e.message);
    }
};



app.get('/get-url',async (req,res)=>{
    const {id,dir}=req.query;

  

    try{
        
        const response= await s3.send(new GetObjectCommand({
            Bucket:'lawtus',
            Key:id
        }));
        const loadedm3u8=await streamtostring(response.Body);

        const reformedm3u8 =await Promise.all( loadedm3u8.split('\n').map(async(each)=>{
            if(each.endsWith('.ts')){
                const eachstream = await getSignedUrl(s3,new GetObjectCommand({
                    Bucket:'lawtus',
                    Key:dir+'/'+each.trim()
                }),{expiresIn:500000});
                return eachstream;
            }
            return each.trim();
        }));

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

         

        res.send(reformedm3u8.join('\n'))

        

        

    }catch(e){
        res.setHeader("Content-Type", "text/plain");
        res.send(`${e.message}`);
        
    }

    
    
    
});

app.get('/list-filename',async(req,res)=>{
    const {dir}=req.query;
    const command=new ListObjectsV2Command({Bucket:'lawtus',Prefix: `${dir}/` });
    const list=await s3.send(command);
    console.log(list.Contents.map(item => item.Key));

    const filenamelist=list.Contents .map(item => item.Key)
        .filter(item => item !== `${dir}/`)
        .map(item => {
            const trimmed = item.slice(dir.length + 1); // remove "dir/"
            return trimmed.includes('/') ? trimmed.split('/')[0] +'/': trimmed;
        })
        .filter((value, index, self) => self.indexOf(value) === index);
    
    const folderlist=filenamelist.filter((item)=>{
        return item.endsWith('/')
    })
    const filelist=filenamelist.filter((item)=>{
        return item.endsWith('/')===false
    });

    res.send([...folderlist,...filelist]);
 

})

app.get('/getsignedurl',async(req,res)=>{
    const {dir}=req.query;
    const url=await getSignedUrl(s3,new GetObjectCommand({
        Bucket:'lawtus',
        Key:dir
    }),{expiresIn:2000});

    res.send(url)
})

app.get('/getimg',async(req,res)=>{
    const {dir}=req.query;
    const data=await s3.send(new GetObjectCommand({
        Bucket:'lawtus',
        Key:dir
    }));

    const chunks = [];
    for await (const chunk of data.Body) {
        chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    res.set({
        'Content-Type': 'image/jpg',  
    });
    res.send(buffer);
    
})



app.get('/get-m3u8',async(req,res)=>{
    const {id,dir}= req.query;
    const originalm3u8stream=await s3.send(new GetObjectCommand(
        {
            Bucket:'lawtus',
            Key:id
        }
    ));
    res.set({
    'Content-Type': 'application/x-mpegURL',
    'Content-Disposition': `inline; filename="${id?.split('/').pop() || 'playlist.m3u8'}"`,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': '*',
    });
    const originalm3u8=await streamtostring(originalm3u8stream.Body);
    const linelist=originalm3u8.split('\n').map((line)=>{
        if(line.endsWith('.ts')){
            return `https://cdn.lawtusprep.org/get-video?id=${dir}/${line}`
        }
        return line
    });

    res.send(linelist.join('\n'));
})

app.get('/get-video',async(req,res)=>{
    const {id}=req.query;
    const videostream=await s3.send(new GetObjectCommand(
        {
            Bucket:'lawtus',
            Key:id
        }
    ));

    res.set({
        'Content-Type': 'video/MP2T',
        'Content-Length': videostream.ContentLength,
        'Content-Disposition': `inline; filename="${id.split('/').pop()}"`,
        'Access-Control-Allow-Origin': '*', // important!
        'Access-Control-Allow-Headers': '*'
    });
    videostream.Body.pipe(res);
    
})

app.post('/reset-pass',async(req,res)=>{
    try{
       
        const {user,email} = req.body;
        
        const mailsnap = await admin.firestore().collection('students').doc(user).get();
        
        console.log(mailsnap.data()['email']);
        if (mailsnap.exists){
            const actionCodeSettings = {
            url: 'https://passwordresetpagebuild.onrender.com', // your Flutter web page
            handleCodeInApp: true,
            };
           
            const link = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
            const urlObj = new URL(link);
            const oobCode = urlObj.searchParams.get('oobCode');
            const mode = urlObj.searchParams.get('mode');
            const customLink = `https://passwordresetpagebuild.onrender.com?mode=${mode}&oobCode=${oobCode}&user=${user}`;
            
           console.log(mailsnap.data()['email'])
            await mailer.sendMail({
                from: 'support@lawtus.in',
                to: mailsnap.data()['email'],
                subject: "Lawtus - Password Reset",
                text: `Click here to reset your password: ${customLink}`,
                html: `<!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                  <title>Reset Your Password</title>
                </head>
                <body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, Helvetica, sans-serif;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8; padding:30px 0;">
                    <tr>
                      <td align="center">
                        <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.05);">
                          
                          <!-- Header -->
                          <tr>
                            <td style="background:#0f172a; padding:24px; text-align:center;">
                              <h1 style="color:#ffffff; margin:0; font-size:24px;">Lawtus</h1>
                            </td>
                          </tr>

                          <!-- Body -->
                          <tr>
                            <td style="padding:32px;">
                              <h2 style="margin-top:0; color:#0f172a;">Reset your password</h2>

                              <p style="color:#475569; font-size:15px; line-height:1.6;">
                                We received a request to reset your Lawtus account password.
                                If you made this request, click the button below to continue.
                              </p>

                              <!-- Button -->
                              <div style="text-align:center; margin:32px 0;">
                                <a 
                                  href="${customLink}"
                                  style="
                                    background:#2563eb;
                                    color:#ffffff;
                                    text-decoration:none;
                                    padding:14px 28px;
                                    border-radius:6px;
                                    font-weight:600;
                                    display:inline-block;
                                  "
                                >
                                  Reset Password
                                </a>
                              </div>

                              <p style="color:#475569; font-size:14px; line-height:1.6;">
                                This link will expire shortly for security reasons.
                              </p>

                              <p style="color:#475569; font-size:14px; line-height:1.6;">
                                If you didn’t request a password reset, you can safely ignore this email.
                              </p>

                              <hr style="border:none; border-top:1px solid #e5e7eb; margin:30px 0;" />

                              <p style="color:#64748b; font-size:12px;">
                                Having trouble? Copy and paste this link into your browser:
                              </p>
                              <p style="word-break:break-all; font-size:12px; color:#2563eb;">
                                ${customLink}
                              </p>
                            </td>
                          </tr>

                          <!-- Footer -->
                          <tr>
                            <td style="background:#f8fafc; padding:20px; text-align:center; font-size:12px; color:#94a3b8;">
                              © 2026 Lawtus. All rights reserved.
                            </td>
                          </tr>

                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                `,
            })
            
            return res.json({ success: true, message: "Recovery email sent!" });
        }
        else{
            return res.json({
                success:false,
                message:"Couldn't send the reset link"
            });
        }
    }catch(e){
        console.log(e.message)
        
    }
})

app.post('/checkforfile',async (req,res)=>{
    const {filenames}=req.body;
    
    const result=await Promise.all(
        filenames.map(async(filename)=>{
            try{
                const command=new HeadObjectCommand({
                    Bucket:'lawtus',
                    Key:filename
                })
                try{
                    await s3.send(command);
                    return {'filename':filename,'exists':true};
                }catch(e){
                    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
                        return { 'filename': filename, 'exists': false };
                    }
                    
                }
            }catch(e){
                res.send('Error');
            }
           
        })
        
    );
    
    res.json({result});
})

app.post("/scheduleWritetest", async (req, res) => {
  try {
    const { data1, data2 ,quizid} = req.body;

    const date1 = DateTime.fromISO(data1.time, { zone: "Asia/Kolkata" });
    const date2 = DateTime.fromISO(data2.time, { zone: "Asia/Kolkata" });

    const project = "lawtus-d033f";
    const queue = "scheduling-queue";
    const location = "us-central1";

    const url = `https://lawtusbackend.onrender.com/delayedWritetest`;

    const parent = tasksClient.queuePath(project, location, queue);
    console.log(parent);

    const task1 = {
      httpRequest: {
        httpMethod: "POST",
        url,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify(data1)).toString("base64"),
      },
      scheduleTime: { seconds: Math.floor(date1.toSeconds()) },
    };
    console.log('mm');

    const task2 = {
      httpRequest: {
        httpMethod: "POST",
        url,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify(data2)).toString("base64"),
      },
      scheduleTime: { seconds: Math.floor(date2.toSeconds()) },
    };

    const [task1id]=await tasksClient.createTask({ parent, task: task1 });
    const [task2id]=await tasksClient.createTask({ parent, task: task2 });
    console.log('task scheduled')
    console.log(task1id);
    console.log(quizid);

    await db.collection("tests").doc(quizid).set({
      scheduledstarttime: Timestamp.fromDate(date1.toJSDate()),
      scheduledendtime: Timestamp.fromDate(date2.toJSDate()),
      task1id:task1id.name,
      task2id:task2id.name
    },{merge:true});

    res.send('Task scheduled');

  } catch (err) {
    console.error("Schedule error:", err);
    res.status(500).send("Failed to schedule");
  }
});

app.post("/scheduleWritestudent", async (req, res) => {
  try {
    console.log('start');
    const { data,startedtime,initialset} = req.body;

    const date = DateTime.fromISO(data.time, { zone: "Asia/Kolkata" });
    const starteddate = DateTime.fromISO(startedtime, { zone: "Asia/Kolkata" });

    console.log(date);
    const project = "lawtus-d033f";
    const queue = "scheduling-queue-student";
    const location = "us-central1";

    const url = `https://lawtusbackend.onrender.com/delayedWritestudent`;

    const parent = tasksClient.queuePath(project, location, queue);
    console.log('mmmm');
    const task = {
      httpRequest: {
        httpMethod: "POST",
        url,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify(data)).toString("base64"),
      },
      scheduleTime: { seconds: Math.floor(date.toSeconds()) },
    };

    const [taskid]=await tasksClient.createTask({ parent, task: task });
    await db.collection("students").doc(data.uid).collection("tests").doc(data.quizid).set({
      taskid:taskid.name,
      startedtime:Timestamp.fromDate(starteddate.toJSDate()),
      status:'started'
    },{merge:true});

    await db.collection("marks").doc(data.uid).set({
      [data.quizid]: {
        answers:initialset,
        startedtime: Timestamp.fromDate(starteddate.toJSDate())
      },
    },{merge:true});


    res.send("Tasks scheduled");
  } catch (err) {
    console.error("Schedule error:", err);
    res.status(500).send("Failed to schedule");
  }
});

app.post("/delayedWritetest", async (req, res) => {
  try {
    const { quizid, status } = req.body;

    await db.collection("tests").doc(quizid).set({
      status: status,
      executedAt: admin.firestore.FieldValue.serverTimestamp(),
    },{merge:true});

    res.send("Document written");
  } catch (err) {
    console.error("Delayed write error:", err);
    res.status(500).send("Failed to write");
  }
});
app.post("/delayedWritestudent", async (req, res) => {
  try {
    const { quizid, uid } = req.body;

    await db.collection("students").doc(uid).collection("tests").doc(quizid).set({
      status: 'submitted',
      endtime: admin.firestore.FieldValue.serverTimestamp(),
    },{merge:true});

    res.send("Document written");
  } catch (err) {
    console.error("Delayed write error:", err);
    res.status(500).send("Failed to write");
  }
});


app.get("/functogetlivetime", (req, res) => {
  try {
    const time = new Date()
      .toLocaleString("sv-SE", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      })
      .replace(" ", "T");

    res.json({ time });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "error" });
  }
});

app.post("/deletecloudtasktest",async(req,res)=>{

  async function safeDelete(taskName) {
    try {
      await tasksClient.deleteTask({ name: taskName });
    } catch (e) {
      if (e.code !== 5) throw e; // 5 = NOT_FOUND
    }
  }
  try{
    const {task1id,task2id,quizid}=req.body;
    await safeDelete(task1id);
    await safeDelete(task2id);
    
    await db.collection("tests").doc(quizid).update({
      scheduledstarttime: admin.firestore.FieldValue.delete(),
      scheduledendtime: admin.firestore.FieldValue.delete(),
      task1id: admin.firestore.FieldValue.delete(),
      task2id: admin.firestore.FieldValue.delete(),
      status: admin.firestore.FieldValue.delete(),
    },{merge:true});
    res.send('Deleted');
  }catch(e){
    console.log(e);
    res.status(500).json({ error: "error" });
  }
})

app.post("/deletecloudtaskstudent",async(req,res)=>{

  async function safeDelete(taskName) {
    try {
      await tasksClient.deleteTask({ name: taskName });
    } catch (e) {
      if (e.code !== 5) throw e; // 5 = NOT_FOUND
    }
  }
  try{
    const {uid,quizid}=req.body;
    const snap=await db.collection("students").doc(uid).collection("tests").doc(quizid).get();
    await db.collection("students").doc(uid).collection("tests").doc(quizid).update({
      status:'submitted',
      endtime:admin.firestore.FieldValue.serverTimestamp()
    });
    await safeDelete(snap.data().taskid);
    res.send('Deleted');
  }catch(e){
    console.log(e);
    res.status(500).json({ error: "error" });
  }
})

app.listen(3000,()=>{
    console.log('running');
})
