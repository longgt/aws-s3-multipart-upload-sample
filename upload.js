// Load config from .env file
// Copy .env.example into .env then adjust value to match with your configuration
const dotenv = require("dotenv");
dotenv.config();

const {
  S3Client,
  // AbortMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

// https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html
const CHUNK_SIZE = 5000 * 1024 * 1024; // AWS S3 allows minimum 5MiB each

// Create S3 client
// Adjust "credentials" to match with your use case
const client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Execute S3 client command
 * @param command The command to be executed
 */
async function executeCommand(command) {
  try {
    const data = await client.send(command);
    return data;
  } catch (e) {
    console.error(`Execute command failed`, e);
  }
}

/**
 * Uploads the individual parts of the file
 * @param fileBuffer the buffer of file content, could be NodeJS Buffer or HTML 5 File API Blob
 * @param uploadOptions the options for upload
 */
async function uploadParts(fileBuffer, uploadOptions) {
  const fileSize = fileBuffer.length;
  let chunkCount = 0;
  let readBytes = 0;
  let uploadPartResults = [];
  
  /**
   * This internal function will upload part into S3 sequentially 
   */
  async function readNextChunk() {
    if (readBytes >= fileSize) {
      return;
    }

    // Chunk will be started at 1
    chunkCount++;
    const data = fileBuffer.slice(
      readBytes,
      Math.min(readBytes + CHUNK_SIZE, fileSize)
    );
    readBytes += data.length;

    // Create UploadPartCommand then execute to upload into S3
    const uploadPartCommand = new UploadPartCommand({
      Bucket: uploadOptions.Bucket,
      Key: uploadOptions.Key,
      UploadId: uploadOptions.UploadId,
      Body: data,
      ContentLength: data.length,
      PartNumber: chunkCount,
    });

    const uploadPartResult = await executeCommand(uploadPartCommand);

    // Push { PartNumber, ETag } into return object
    uploadPartResults.push({
      PartNumber: chunkCount,
      ETag: uploadPartResult.ETag,
    });

    // Upload the next chunk, if any
    await readNextChunk();
  }

  // Starts the process to upload parts
  await readNextChunk();

  return uploadPartResults;
}

(async () => {
  // All below sample codes is referenced from
  // https://blog.filestack.com/tutorials/amazon-s3-multipart-uploads-javascript/
  const uploadFile = "sample.png";
  const uploadKey = `multiparts/${uploadFile}`;

  // starts the upload process by generating a unique UploadId
  const createCommand = new CreateMultipartUploadCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: uploadKey,
    ACL: "public-read",
  });
  const createResult = await executeCommand(createCommand);

  // Read file content, in browser it can be replaced by HTML 5 File Object
  const fileBuffer = fs.readFileSync(path.join(__dirname, "data", uploadFile), {
    flag: "r",
  });

  // Uploads the individual parts of the file
  const uploadPartsResult = await uploadParts(fileBuffer, {
    Bucket: createResult.Bucket,
    Key: createResult.Key,
    UploadId: createResult.UploadId,
  });

  // Signals to S3 that all parts have been uploaded and it can combine the parts into one file
  const completeCommand = new CompleteMultipartUploadCommand({
    Bucket: createResult.Bucket,
    Key: createResult.Key,
    UploadId: createResult.UploadId,
    MultipartUpload: {
      Parts: uploadPartsResult,
    },
  });

  const completeResult = await executeCommand(completeCommand);

  console.log("Uploaded multipart successfully", completeResult);

  /*
   * Use the below command to abort multipart upload request
   */
  /*
  const abortCommand = new AbortMultipartUploadCommand({
    Bucket: createResult.Bucket,
    Key: createResult.Key,
    UploadId: createResult.UploadId,
  });
  const abortResult = await executeCommand(abortCommand);
  */
})();
