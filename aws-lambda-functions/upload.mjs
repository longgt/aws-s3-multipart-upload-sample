import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsCommand,
    DeleteObjectCommand
  } from "@aws-sdk/client-s3";
  import { v4 } from 'uuid';
  
  import * as parser from 'lambda-multipart-parser';
  
  const UPLOAD_TYPE = {
    FIRST: '0',
    PART: '1',
    COMPLETE: '2',
    ABORT: '3'
  };

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
          reject(err);
        })
     
      })
    }
    
  async function completeStreamGenerator(parts, lastPartBuffer) {
      const buffers = [];
      for (const part of parts) {
          const getCommand = new GetObjectCommand({
                  Bucket: bucket,
                  Key: part.Key,
              });
              
          const getResult = await client.send(getCommand);
          const partBuffer = await streamToBuffer(getResult.Body);
          buffers.push(partBuffer);
      }
      
      buffers.push(lastPartBuffer);
      
      return Buffer.concat(buffers);
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
          
          if (type == UPLOAD_TYPE.FIRST) {
              // Create first part
              let newUploadId = v4();
              
              const command = new PutObjectCommand({
                  Bucket: process.env.AWS_XS3_BUCKET,
                  Key: `multiparts/temp/${newUploadId}.part${partNumber}`,
                  Body: files[0].content
              });
              
              const uploadResult = await client.send(command);
              
              return {
                  statusCode: 200,
                  body: JSON.stringify({
                      uploadId: newUploadId,
                      ETag: uploadResult.ETag,
                  })
              };
          } else if (type == UPLOAD_TYPE.PART) {
              // Upload next part
              const command = new PutObjectCommand({
                  Bucket: process.env.AWS_XS3_BUCKET,
                  Key: `multiparts/temp/${uploadId}.part${partNumber}`,
                  Body: files[0].content
              });
              
              const uploadResult = await client.send(command);
              
              return {
                  statusCode: 200,
                  body: JSON.stringify({
                      uploadId: uploadId,
                      ETag: uploadResult.ETag,
                  })
              };
          } else if (type == UPLOAD_TYPE.COMPLETE) {
              // Complete
              const listCommand = new ListObjectsCommand({
                  Bucket: process.env.AWS_XS3_BUCKET,
                  Delimiter: '/',
                  Prefix: `multiparts/temp/${uploadId}`,
              });
              const listResult = await client.send(listCommand);
              const parts = listResult.Contents || [];
              parts.sort((a, b) => a.Key.localeCompare(b.Key));
              const completeBodyStream = await completeStreamGenerator(parts, files[0].content);
              
              const command = new PutObjectCommand({
                  Bucket: process.env.AWS_XS3_BUCKET,
                  Key: `multiparts/${files[0].filename}`,
                  Body: completeBodyStream
              });
              const uploadResult = await client.send(command);
  
              return {
                  statusCode: 200,
                  body: JSON.stringify(uploadResult)
              };
          } else {
              // Abort
              const listCommand = new ListObjectsCommand({
                  Bucket: bucket,
                  Delimiter: '/',
                  Prefix: `multiparts/temp/${uploadId}`,
              });
              const listResult = await client.send(listCommand);
              const parts = listResult.Contents || [];
              parts.sort((a, b) => a.Key.localeCompare(b.Key));
              try {
                  //Delete all temp files
                  const deletePromises = [];
                  for (const tempFile of parts) {
                      const deleteCommand = new DeleteObjectCommand({
                          Bucket: process.env.AWS_XS3_BUCKET,
                          Key: tempFile.Key,
                      });
                      deletePromises.push(client.send(deleteCommand));
                  }
                  await Promise.all(deletePromises);
                  
              } catch (e) {
                  console.error(e);
              }
              return {
                  statusCode: 200,
                  body: JSON.stringify({ uploadId })
              };
          }
      }
  };
  