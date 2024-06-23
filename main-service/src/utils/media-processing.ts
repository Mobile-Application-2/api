import {IMedia, IMediaFromSocket} from '../interfaces/media';
import {upload_file} from './cloudinary';

export async function processAndUpload(media: IMediaFromSocket[] | undefined) {
  if (typeof media === 'undefined') {
    return;
  }

  const processedMedia: IMedia[] = [];
  for (const mediaItem of media) {
    const {data, type} = mediaItem;

    // importing this here because the package is pure esm and won't work at the top
    const {fileTypeFromBuffer} = await import('file-type');

    const mediaMetadata: IMedia = {
      originalExtension: '',
      originalFileSize: 0,
      originalMimetype: '',
      type: 'file',
      url: '',
    };

    // get the buffer
    const fileBuffer = Buffer.from(data, 'base64');

    // file type
    if (['image', 'video', 'audio', 'file'].includes(type) === false) {
      throw Error('Media processing failed, file type is not an accepted type');
    }
    mediaMetadata.type = type;

    const fileInfo = await fileTypeFromBuffer(fileBuffer);

    if (typeof fileInfo === 'undefined') {
      throw Error(
        'Media processing failed, file extension and mimetype could not be determined automatically'
      );
    }

    // fileSize
    mediaMetadata.originalFileSize = fileBuffer.length;

    // mimetype
    mediaMetadata.originalMimetype = fileInfo.mime;
    mediaMetadata.originalExtension = fileInfo.ext;

    mediaMetadata.url = await upload_file(fileBuffer, 'messages');

    processedMedia.push(mediaMetadata);
  }

  return processedMedia;
}
