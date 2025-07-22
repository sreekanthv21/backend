const express = require('express');

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {S3Client, GetObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");


const app= express();

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
                    Key:dir+each.trim()
                }),{expiresIn:500000});
                return eachstream;
            }
            return each.trim();
        }));

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Content-Disposition", 'inline; filename="playlist.m3u8"');

        res.send(reformedm3u8.join('\n'))

        

        

    }catch(e){
        res.setHeader("Content-Type", "text/plain");
        res.send('error hapenned');
        res.send('error')
    }

    
    
    
});

app.get('/list-filename',async(req,res)=>{
    const {dir}=req.query;
    const command=new ListObjectsV2Command({Bucket:'lawtus',Prefix: `${dir}/` });
    const list=await s3.send(command);

    const filenamelist=list.Contents.map((item)=>{
        const initial=item.Key;
        const initiallist=initial.split("/");
        return initiallist[initiallist.length-1];
    });

    res.send(filenamelist);


})

app.listen(3000,()=>{
    console.log('running');
})
