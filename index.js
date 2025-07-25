const express = require('express');
const cors= require('cors');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {S3Client, GetObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");

const fetch = require('node-fetch');
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



app.get('/get-m3u8', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).send('Missing file param');

  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: file });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

    const resp = await fetch(signedUrl);
    if (!resp.ok) {
      console.error('Failed to fetch m3u8:', resp.statusText);
      return res.status(500).send('Error fetching m3u81');
    }

    const text = await resp.text();
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(text);
  } catch (err) {
    console.error('M3U8 Fetch Error:', err);
    res.status(500).send('Error fetching m3u8');
  }
});

// 🎯 .TS Proxy Endpoint
app.get('/proxy', async (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).send('Missing key param');

  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

    const fileResp = await fetch(signedUrl);
    if (!fileResp.ok) {
      console.error('Failed to fetch TS file:', fileResp.statusText);
      return res.status(500).send('Error fetching .ts');
    }

    res.setHeader('Content-Type', fileResp.headers.get('content-type') || 'video/MP2T');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    fileResp.body.pipe(res);
  } catch (err) {
    console.error('TS Proxy Error:', err);
    res.status(500).send('Proxy error');
  }
});

app.listen(3000,()=>{
    console.log('running');
})
