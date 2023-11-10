const express = require("express");
const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const CustomEmailTemplate = require("./emailTemplate");
const fs = require("fs");
const readline = require("readline");

//all the details are fetching from the config.js file 
const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  TOKEN_PATH,
  USER_EMAIL,
} = require("./config");

const app = express();

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);


app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

//Authorize the user for the first time 
app.get("/authorize", (req, res) => {

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://mail.google.com/',
    ],
  });

  //console.log("Authorization URL:", authUrl);

  res.redirect(authUrl);
});

//After sucessfull Authorization callback
app.get("/callback", (req, res) => {
  const code = req.query.code;
  oAuth2Client.getToken(code, async (err, token) => {
    if (err) {
      console.error("Error retrieving access token", err);
      res.send("Error retrieving access token");
      return;
    }

    oAuth2Client.setCredentials(token);

    console.log("Received token:", token);

    try {
      await fs.promises.writeFile(TOKEN_PATH, JSON.stringify(token));
      console.log("Token stored in", TOKEN_PATH);
      res.send("Authorization successful. You can close this window.");

      //start the interval to run the sendMail function every 60 seconds
      intervalId = setInterval(async () => {
        console.log("Checking for new emails...");
        await sendMail();
        console.log("Task completed, new emails will be checked after 60 seconds.");
      }, 60000);                                                                        

    } catch (writeError) {
      console.error("Error storing access token", writeError);
      res.send("Error storing access token");
    }
  });
});

app.listen(3500, () => {
  console.log("Server listening on port 3500!");
  console.log(
    "Authorize this app by visiting: http://localhost:3500/authorize"
  );
});

//SendMail function to send the mail using the template from the emailTemplate.js file
async function sendMail() {
  try {
    await oAuth2Client.refreshAccessToken();
    const accessToken = oAuth2Client.credentials.access_token;

    // Initialize the Gmail API
    const gmail = google.gmail("v1");

    // Build the search query to find unread and new messages received at the present time
    const searchQuery = "is:unread is:inbox";

    const messages = await gmail.users.messages.list({
      auth: oAuth2Client,
      userId: USER_EMAIL,
      q: searchQuery,
    });                                                         //NOTE:- we can check for others factors also before sending the email replies as if it was in the promotion or primary 

    // Check if there are any matching messages
    if (!messages.data.messages || messages.data.messages.length === 0) {
      console.log("No new and unread messages found.");
      return;
    }

    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: USER_EMAIL,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: oAuth2Client.credentials.refresh_token,
        accessToken: accessToken,
      },
    });

    // Create a custom label if it doesn't exist
    const labelName = "Auto Email Reply"; // Custom label name 
    const labelExists = await gmail.users.labels.list({
      auth: oAuth2Client,
      userId: USER_EMAIL,
    });
    const labels = labelExists.data.labels;

    const customLabel = labels.find((label) => label.name === labelName);

    if (!customLabel) {

      // Label doesn't exist, create it
      await gmail.users.labels.create({
        auth: oAuth2Client,
        userId: USER_EMAIL,
        resource: { name: labelName },
      });
    }                                                         //NOTE:- In this code snippet if we got unread messages in our email previously before making any custom label than that messages wont go into the custom label

    // Get senders' email from the unread and new emails
    for (const message of messages.data.messages) {
      const messageDetails = await gmail.users.messages.get({
        auth: oAuth2Client,
        userId: USER_EMAIL,
        id: message.id,
      });

      const senderHeader = messageDetails.data.payload.headers.find(
        (header) => header.name === "From"
      );

      if (senderHeader) {
        const senderEmail = senderHeader.value;

        // Compose a reply email
        const emailTemplate = CustomEmailTemplate(senderEmail);

        const result = await transport.sendMail(emailTemplate);
        console.log("Replied to:", senderEmail, "Result:", result.response);

        // Mark the email as read and add to the custom label made by me 
        await gmail.users.messages.modify({
          auth: oAuth2Client,
          userId: USER_EMAIL,
          id: message.id,
          resource: {
            removeLabelIds: ["UNREAD"],
            addLabelIds: [customLabel.id],
          },
        });
        console.log("Marked as read and added to custom Label:", message.id);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}


