import { Avatar, AvatarFallback, AvatarImage } from "wobbui";

export default function SampleAvatar() {
  return (
    <Avatar>
      <AvatarImage src="https://github.com/dxu.png" alt="@dxu" />
      <AvatarFallback>DX</AvatarFallback>
    </Avatar>
  );
}
