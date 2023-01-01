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

(async () => {
  const part1Buffer = fs.readFileSync(
    path.join(__dirname, "data", "sample_part1.png"),
    {
      flag: "r",
    }
  );
  const part2Buffer = fs.readFileSync(
    path.join(__dirname, "data", "sample_part2.png"),
    {
      flag: "r",
    }
  );
  const part3Buffer = fs.readFileSync(
    path.join(__dirname, "data", "sample_part3.png"),
    {
      flag: "r",
    }
  );

  try {
    let chunkCount = 1;
    let form = new FormData();
    form.append("type", UPLOAD_TYPE.FIRST);
    form.append("partNumber", chunkCount++);
    form.append("file", part1Buffer, {
      filename: ORIGIN_FILE_NAME,
      contentType: CONTENT_TYPE,
    });
    let chunkResponse = await axios.post(ENDPOINT, form, {
      headers: {
        Authorization: authorizationHeader,
        "Content-Type": "multipart/form-data",
      },
    });
    console.log(`Chunk[${chunkCount - 1}] upload result`, chunkResponse.data);
    const uploadId = chunkResponse.data.uploadId;

    // Upload part
    form = new FormData();
    form.append("type", UPLOAD_TYPE.PART);
    form.append("partNumber", chunkCount++);
    form.append("file", part2Buffer, {
      filename: ORIGIN_FILE_NAME,
      contentType: CONTENT_TYPE,
    });
    form.append("uploadId", uploadId);

    chunkResponse = await axios.post(ENDPOINT, form, {
      headers: {
        Authorization: authorizationHeader,
        "Content-Type": "multipart/form-data",
      },
    });

    console.log(`Chunk[${chunkCount - 1}] upload result`, chunkResponse.data);

    // Last chunk
    form = new FormData();
    form.append("type", UPLOAD_TYPE.COMPLETE);
    form.append("partNumber", chunkCount++);
    form.append("file", part3Buffer, {
      filename: ORIGIN_FILE_NAME,
      contentType: CONTENT_TYPE,
    });
    form.append("uploadId", uploadId);

    chunkResponse = await axios.post(ENDPOINT, form, {
      headers: {
        Authorization: authorizationHeader,
        "Content-Type": "multipart/form-data",
      },
    });

    console.log(`Last chunk upload result`, chunkResponse.data.ETag);

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
