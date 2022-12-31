import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsCommand,
    DeleteObjectCommand
  } from "@aws-sdk/client-s3";
  
  import { v4 } from 'uuid';
  
  import * as parser from 'lambda-multipart-parser';
  
  const client = new S3Client({
    region: process.env.AWS_XREGION,
    credentials: {
      accessKeyId: process.env.AWS_XACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_XSECRET_ACCESS_KEY,
    }
  });
  const bucket = process.env.AWS_XS3_BUCKET;
  
  async function streamToBuffer (stream) {
      return new Promise((resolve, reject) => {
        const data = [];
  
        stream.on('data', (chunk) => {
          data.push(chunk);
        });
  
        stream.on('end', () => {
          resolve(Buffer.concat(data))
        })
  
        stream.on('error', (err) => {
          reject(err)
        })
     
      })
    }
  
  export const handler = async(event) => {
      
      let httpMethod = 'GET';
      if (event.requestContext && event.requestContext) {
          if (event.requestContext.httpMethod) {
              httpMethod = event.requestContext.httpMethod;
          } else if (event.requestContext.http.method) {
              httpMethod = event.requestContext.http.method;
          }
          httpMethod = httpMethod.toUpperCase();
      }
  
      if (httpMethod === 'GET') {
          const response = {
              statusCode: 200,
              body: JSON.stringify(`Hello from Lambda! id=${v4()}`),
          };
          return response;
      } else {
          const parseResult = await parser.parse(event);
          
          const { type, files, name, uploadId, partNumber = '1' } = parseResult || {};
          
          console.log("Request type", type, type === '0');
          if (type === '0') {
              // Create first part
              let newUploadId = v4();
              
              const command = new PutObjectCommand({
                  Bucket: bucket,
                  Key: `multiparts/temp/${newUploadId}.part${partNumber}`,
                  Body: files[0].content
              });
              
              const uploadResult = await client.send(command);
              console.log("Request upload id", newUploadId);
              
              return {
                  statusCode: 200,
                  body: JSON.stringify({
                      uploadId: newUploadId,
                      ETag: uploadResult.ETag,
                  })
              };
          } else if (type === '1') {
              // Upload next part
  
          } else {
              // Complete
              const getCommand = new GetObjectCommand({
                  Bucket: bucket,
                  Key: `multiparts/temp/${uploadId}.part1`,
              });
              
              const getResult = await client.send(getCommand);
              const part1Buffer = await streamToBuffer(getResult.Body);
              
              const command = new PutObjectCommand({
                  Bucket: bucket,
                  Key: `multiparts/${files[0].filename}`,
                  Body: Buffer.concat([part1Buffer, files[0].content])
              });
              const uploadResult = await client.send(command);
              
              try {
                  //TODO delete all temp files
                  const listCommand = new ListObjectsCommand({
                      Bucket: bucket,
                      Delimiter: '/',
                      Prefix: `multiparts/temp/${uploadId}`,
                  });
                  const listResult = await client.send(listCommand);
                  if (Array.isArray(listResult.Contents)) {
                      const deletePromises = [];
                      for (const tempFile of listResult.Contents) {
                          const deleteCommand = new DeleteObjectCommand({
                              Bucket: bucket,
                              Key: tempFile.Key,
                          });
                          deletePromises.push(client.send(deleteCommand));
                      }
                      
                      await Promise.all(deletePromises);
                  }
              } catch (e) {
                  console.error(e);
              }
              return {
                  statusCode: 200,
                  body: JSON.stringify(uploadResult)
              };
          }
          return {
              statusCode: 200,
              body: 'POST implement'
          }
      }
  };
  