const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const axiosRetry = require('axios-retry');
const dotenv = require("dotenv");

dotenv.config();

const ENDPOINT =
  "https://vm3h8bun7l.execute-api.ap-southeast-1.amazonaws.com/prod";
//"https://manfgc2pocxr3tssyrlfzkhdpe0ubrgi.lambda-url.ap-southeast-1.on.aws/";
const authorizationHeader = `${process.env.AWS_API_KEY}`;
const ORIGIN_FILE_NAME = "sample.png";
const CONTENT_TYPE = "image/png";
const UPLOAD_TYPE = {
  FIRST: '0',
  PART: '1',
  COMPLETE: '2',
  ABORT: '3'
};

axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 1000,
  retryCondition: (error) => {
    return error.response && error.response.status >= 500;
  }
});

async function uploadMultiparts(blob, chunkSize, callback) {
  let totalChunk = Math.ceil(blob.length / chunkSize);
  let chunkCount = 0;
  let readBytes = 0;
  
  const readPart = async () => {
      if (readBytes >= blob.length) {
          return;
      }

      const start = readBytes;
      const end = Math.min(blob.length, readBytes + chunkSize);
      const partBuf = blob.slice(start, end);
      readBytes += partBuf.length;
      
      const chunkNumber = ++chunkCount;
      // Trigger upload next part
      const next = chunkNumber === totalChunk ? () => {} : async () => {
          await readPart();
      };
      // Invoke callback
      await callback(partBuf, { ranges: { start, end }, chunkNumber, totalChunk }, next);
  };

  // Begin upload 1st part
  await readPart();
}

(async () => {
  // Read file into buffer
  const fileBuffer = fs.readFileSync(
    path.join(__dirname, "data", "sample.png"),
    {
      flag: "r",
    }
  );

  try {
    let uploadId = '';

    // Upload file by splitting into multiparts, 4MiB each
    await uploadMultiparts(fileBuffer, 4 * 1024 * 1024, async (partBuf, options, next) => {
      let type;

      if (options.chunkNumber == options.totalChunk) {
        type = UPLOAD_TYPE.COMPLETE;
      } else if (options.chunkNumber == 1) {
        type = UPLOAD_TYPE.FIRST;
      } else {
        type = UPLOAD_TYPE.PART;
      }

      let form = new FormData();
      form.append("type", type);
      form.append("partNumber", options.chunkNumber);
      form.append("file", partBuf, {
        filename: ORIGIN_FILE_NAME,
        contentType: CONTENT_TYPE,
      });
      if (uploadId) {
        form.append("uploadId", uploadId);
      }
      let chunkResponse = await axios.post(ENDPOINT, form, {
        headers: {
          Authorization: authorizationHeader,
          "Content-Type": "multipart/form-data",
        },
      });
  
      console.log(`Chunk[${options.chunkNumber}] upload result`, chunkResponse.data);

      if (chunkResponse.data.uploadId) {
        uploadId = chunkResponse.data.uploadId;
      }

      if (next) {
        await next();
      }
    });

    // Cleanup
    form = new FormData();
    form.append("type", UPLOAD_TYPE.ABORT);
    form.append("uploadId", uploadId);

    chunkResponse = await axios.post(ENDPOINT, form, {
      headers: {
        Authorization: authorizationHeader,
        "Content-Type": "multipart/form-data",
      },
    });

    console.log(`Cleanup result`, chunkResponse.data);
  } catch (e) {
    console.error("Error:", e);
  }
})();
