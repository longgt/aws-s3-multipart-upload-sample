const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const dotenv = require("dotenv");

dotenv.config();

const ENDPOINT =
  "https://vm3h8bun7l.execute-api.ap-southeast-1.amazonaws.com/prod";
//"https://manfgc2pocxr3tssyrlfzkhdpe0ubrgi.lambda-url.ap-southeast-1.on.aws/";
const authorizationHeader = `${process.env.AWS_API_KEY}`;
const ORIGIN_FILE_NAME = "8mb_text.txt";
const UPLOAD_TYPE = {
  FIRST: '0',
  PART: '1',
  COMPLETE: '2',
  ABORT: '3'
};

(async () => {
  const file3MbBuffer = fs.readFileSync(
    path.join(__dirname, "data", "3mb.txt"),
    {
      encoding: "ascii",
      flag: "r",
    }
  );
  const file4MbBuffer = fs.readFileSync(
    path.join(__dirname, "data", "4mb.txt"),
    {
      encoding: "ascii",
      flag: "r",
    }
  );
  const file1MbBuffer = fs.readFileSync(
    path.join(__dirname, "data", "1mb.txt"),
    {
      encoding: "ascii",
      flag: "r",
    }
  );

  try {
    let chunkCount = 1;
    let form = new FormData();
    form.append("type", UPLOAD_TYPE.FIRST);
    form.append("partNumber", chunkCount++);
    form.append("file", file3MbBuffer, {
      filename: ORIGIN_FILE_NAME,
      contentType: "text/plain",
    });
    let chunkResponse = await axios.post(ENDPOINT, form, {
      headers: {
        Authorization: authorizationHeader,
        "Content-Type": "multipart/form-data",
      },
    });
    console.log(`First chunk upload result`, chunkResponse.data);
    const uploadId = chunkResponse.data.uploadId;

    // Upload part
    form = new FormData();
    form.append("type", UPLOAD_TYPE.PART);
    form.append("partNumber", chunkCount++);
    form.append("file", file4MbBuffer, {
      filename: ORIGIN_FILE_NAME,
      contentType: "text/plain",
    });
    form.append("uploadId", uploadId);

    chunkResponse = await axios.post(ENDPOINT, form, {
      headers: {
        Authorization: authorizationHeader,
        "Content-Type": "multipart/form-data",
      },
    });

    console.log(`Part upload result`, chunkResponse.data);

    // Last chunk
    form = new FormData();
    form.append("type", UPLOAD_TYPE.COMPLETE);
    form.append("partNumber", chunkCount++);
    form.append("file", file1MbBuffer, {
      filename: ORIGIN_FILE_NAME,
      contentType: "text/plain",
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
