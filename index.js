const express = require('express');
const cors= require('cors');
const nodemailer=require('nodemailer');
const admin=require('firebase-admin');


const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {S3Client, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require("@aws-sdk/client-s3");

const app= express();
app.use(cors());
app.use(express.json());

const serviceAccount = JSON.parse(process.env.firebasejson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});



const mailer=nodemailer.createTransport({
    service:'gmail',
    auth:{
        user:'kithuin21@gmail.com',
        pass:'xssa ywmy abks jkte'
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
        console.log('zeroth');
        const {user,email} = req.body;
        console.log('first1');
        const mailsnap = await admin.firestore().collection('students').doc(user).get();
        console.log('hot');
        console.log(mailsnap.data()['email']);
        if (mailsnap.exists){
            const actionCodeSettings = {
            url: 'https://passwordresetpagebuild.onrender.com', // your Flutter web page
            handleCodeInApp: true,
            };
            console.log('hot1')
            const link = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
            const urlObj = new URL(link);
            const oobCode = urlObj.searchParams.get('oobCode');
            const mode = urlObj.searchParams.get('mode');
            const customLink = `https://passwordresetpagebuild.onrender.com?mode=${mode}&oobCode=${oobCode}&user=${user}`;
            
            console.log(customLink);
            await mailer.sendMail({
                from: 'kithuin21@gmail.com',
                to: 'kithuv21@gmail.com',
                subject: "Lawtus - Password Reset",
                text: `Click here to reset your password: ${customLink}`,
                html: `<p>Click <a href="${customLink}">here</a> to reset your password.</p>`,
            })
            console.log('shit');
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
    console.log(filenames);
    const result=await Promise.all(
        filenames.map(async(filename)=>{
            try{
                const command=new HeadObjectCommand({
                    Bucket:'lawtus',
                    Key:filename
                })
                try{
                    await S3Client.send(command);
                    return {'filename':filename,'exists':true};
                }catch(e){
                    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
                        return { 'filename': filename, 'exists': false };
                    }
                    console.log('full prob')
                }
            }catch(e){
                res.send('Error');
            }
           
        })
        
    );
    console.log(result);
    res.json({result});
})

app.listen(3000,()=>{
    console.log('running');
})
