import {createTransport} from 'nodemailer';
import {promisify} from 'util';
import hbs, {
  NodemailerExpressHandlebarsOptions,
} from 'nodemailer-express-handlebars';
import path from 'path';

export default async function send_mail(
  email: string,
  templateId: string,
  subject: string,
  dynamicTemplateData: any
): Promise<void> {
  const transporter = createTransport({
    host: process.env.MAIL_HOST,
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const handlebarOptions: NodemailerExpressHandlebarsOptions = {
    viewEngine: {
      defaultLayout: false,
      // this will make sure it requests a new template each time
    },
    viewPath: path.join(__dirname, '../templates'),
  };

  transporter.use('compile', hbs(handlebarOptions));

  const promisified_transporter_send_mail = promisify(
    transporter.sendMail
  ).bind(transporter);

  const mailOptions = {
    from: `"Diane from Skyboard" <${process.env.EMAIL}>`,
    to: email,
    subject: subject,
    template: templateId,
    context: {
      ...dynamicTemplateData,
      subject,
    },
  };

  await promisified_transporter_send_mail(mailOptions);

  return;
}
