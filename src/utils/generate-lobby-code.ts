export function generate_lobby_code() {
  const time = Date.now();
  const randomPart = Math.random() * 10e5;

  const number = Math.random() > 0.5 ? time + randomPart : time - randomPart;

  return number.toString(36).substring(0, 6);
}
