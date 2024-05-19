import {v2 as cloudinary} from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const folderName = process.env.CLOUDINARY_FOLDER;

// define, upload, get and delete functions here
export async function upload_file(file: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {unique_filename: true, folder: folderName},
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result) {
          reject(new Error('File upload failed'));
          return;
        }

        resolve(result.url);
      }
    );

    uploadStream.end(file);
  });
}
