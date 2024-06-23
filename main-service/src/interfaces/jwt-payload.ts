import {JwtPayload} from 'jsonwebtoken';

export interface customJwtPayload extends JwtPayload {
  tokenId: string;
}
