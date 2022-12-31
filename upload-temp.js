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

  let form = new FormData();
  form.append("type", "0");
  form.append("partNumber", "1");
  form.append("file", file3MbBuffer, {
    filename: "7mb.txt",
    contentType: "text/plain",
  });
  try {
    let chunkResponse = await axios.post(ENDPOINT, form, {
      headers: {
        Authorization: authorizationHeader,
        "Content-Type": "multipart/form-data",
      },
    });
    console.log(`First chunk upload result`, chunkResponse.data);

    form = new FormData();
    form.append("type", "2");
    form.append("partNumber", "2");
    form.append("file", file4MbBuffer, {
      filename: "7mb.txt",
      contentType: "text/plain",
    });
    form.append("uploadId", chunkResponse.data.uploadId);

    chunkResponse = await axios.post(ENDPOINT, form, {
      headers: {
        Authorization: authorizationHeader,
        "Content-Type": "multipart/form-data",
      },
    });

    console.log(`Last chunk upload result`, chunkResponse.data.ETag);
  } catch (e) {
    console.error("Error:", e);
  }
})();
