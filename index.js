const express = require('express');
const cors= require('cors');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {S3Client, GetObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");

const app= express();
app.use(cors());

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



app.get('/hls/:filename', async (req, res) => {
  const { filename } = req.params;
  const { dir } = req.query;
  const key = `${dir}/${filename}`;

  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: 'lawtus', Key: key }));
    const m3u8 = await streamtostring(resp.Body);

    const modified = m3u8
      .split('\n')
      .map(line => (line.trim().endsWith('.ts') ? `/proxy?key=${dir}/${line.trim()}` : line))
      .join('\n');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    res.send(modified);
  } catch (err) {
    console.error('m3u8 error:', err);
    res.status(500).send('Error fetching m3u8');
  }
});

// ✅ .ts route — stream directly from Wasabi
app.get('/proxy', async (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).send('Missing key');

  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: 'lawtus', Key: key }));
    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    resp.Body.pipe(res);
  } catch (err) {
    console.error('TS fetch failed:', err);
    res.status(500).send('Wasabi TS fetch failed');
  }
});
app.listen(3000,()=>{
    console.log('running');
})
