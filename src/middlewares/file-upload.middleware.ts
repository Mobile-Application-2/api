import {NextFunction, Request, Response} from 'express';
import {UploadedFile} from 'express-fileupload';

export async function process_file(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // file is optional
  if (typeof req.files === 'undefined' || req.files === null) {
    next();
    return;
  }

  // should be uploaded under 'fieldName'
  const fieldName = 'avatar';
  if (!Object.prototype.hasOwnProperty.call(req.files, fieldName)) {
    res.status(400).json({
      message:
        'File processing failed, please ensure the file is uploaded with the correct field name',
    });
    return;
  }

  // should be only 1 file
  if (Array.isArray(req.files[fieldName])) {
    res.status(400).json({message: 'Please upload only one file'});
    return;
  }

  const file = req.files[fieldName] as UploadedFile;
  // must have image mime type
  if (!file.mimetype.startsWith('image/')) {
    res.status(400).json({message: 'Please upload an image file'});
    return;
  }

  req.body[fieldName] = Buffer.from(file.data);

  next();
}
