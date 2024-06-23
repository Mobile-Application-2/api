interface media {
  type: 'image' | 'video' | 'audio' | 'file';
}

export interface IMediaFromSocket extends media {
  data: string;
}

export interface IMedia extends media {
  originalExtension: string;
  originalFileSize: number;
  originalMimetype: string;
  url: string;
}
