import LOBBY from '../models/lobby.model';

export async function generate_lobby_code(attempts = 0) {
  const time = Date.now();
  const randomPart = Math.random() * 10e5;

  const number = Math.random() > 0.5 ? time + randomPart : time - randomPart;

  const code = number.toString(36).substring(0, 6);

  const codeExists = await LOBBY.findOne({code, active: true});

  if (codeExists && attempts < 10) {
    return generate_lobby_code(attempts + 1);
  }

  if (attempts >= 10) {
    throw {
      name: 'FORMATTED_ERROR',
      type: 'LOBBY_CODE_GENERATION_ERROR',
      message: 'Failed to generate a unique code',
    };
  }

  return code;
}
