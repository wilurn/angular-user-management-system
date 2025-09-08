import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  accessToken: string;
  user: UserResponseDto;

  constructor(accessToken: string, user: UserResponseDto) {
    this.accessToken = accessToken;
    this.user = user;
  }
}