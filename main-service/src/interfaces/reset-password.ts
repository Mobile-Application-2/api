export default interface IResetPassword {
  email: string;
  token: string;
  ip: string | undefined;
}
