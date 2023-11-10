const nodemailer = require('nodemailer');
const { google } = require('googleapis');

function CustomEmailTemplate(senderEmail) {
    const emailTemplate = {
      from: 'Ayush Jha <test19043001@gmail.com>', 
      to: senderEmail, 
      subject: 'Re: Automated reply', // Customize the subject as needed
      text: `Hello, 

This is an automated reply using Gmail Apis.

Best regards,
Ayush Jha`
    };
  
    return emailTemplate;
  }
  
  module.exports = CustomEmailTemplate;