# NEON DUEL — 2 Player Online Shooter

## Chạy trên máy tính

1. Cài Node.js.
2. Mở terminal trong thư mục project.
3. Chạy:

   npm install
   npm start

4. Mở:
   http://localhost:3000

## Test 2 người

- Browser A: tạo phòng.
- Gửi mã 4 ký tự cho Browser B.
- Browser B nhập mã và bấm "Vào phòng".
- Dùng WASD hoặc phím mũi tên để di chuyển.
- Dùng chuột để ngắm, giữ chuột trái để bắn.

## Test 2 thiết bị cùng Wi-Fi

Tìm IP LAN của máy chạy server, ví dụ 192.168.1.10.
Thiết bị thứ hai mở:

http://192.168.1.10:3000

Firewall của máy chủ phải cho phép Node.js/port 3000.

## Deploy Internet

Có thể deploy project Node.js này lên một hosting hỗ trợ Node.js.
Không dùng localhost khi chơi từ Internet.

## Kiến trúc

- server.js: server authoritative, room, movement, bullets, damage, score.
- public/index.html: giao diện và client game.
- Socket.IO: realtime communication.
