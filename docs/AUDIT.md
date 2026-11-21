# Audit TalkMeter (bản trước khi cải tiến, 19/11/2026)

**Repo làm gì:** Trình duyệt thu mic, cắt thành từng đoạn âm thanh, mỗi đoạn gọi `POST /api/transcribe` và trả 0.02 USDC qua x402 trên Avalanche Fuji. Cuối phiên gọi `POST /api/summary` (0.05 USDC) để tóm tắt, rồi server ghi một hash biên lai vào contract `ReceiptLog`.

**Tải giả định:** demo hackathon, 1–3 người dùng cùng lúc, mỗi phiên vài chục đoạn. Mọi chi tiêu là USDC test trên Fuji.

Trạng thái: tất cả mục dưới đây **đã được sửa** trong bản này, trừ chỗ ghi "chưa sửa".

## Phải sửa

1. **Link Snowtrace hỏng** (`src/server.mjs` explorerUrl, `client/src/App.jsx` link từng đoạn)
   - **Vấn đề:** viết `https://snowtrace.io{txHash}`: thiếu `$`, thiếu `/tx/`, và trỏ mainnet thay vì `testnet.snowtrace.io`. Bấm vào ra trang lỗi.
   - **Sửa:** server trả `explorerUrl` dựng bằng `txLink()` trong `networks.mjs`; client lấy gốc explorer từ `/api/config`.
   - **Nếu bỏ qua:** giám khảo không kiểm chứng được giao dịch nào, mất điểm Avalanche Integration và UI/Demo.

2. **Vượt trần ngân sách** (`App.jsx` `startNextSegment`)
   - **Vấn đề:** trần được so với số đã *trả xong*. Đoạn đang chờ STT/settle chưa được tính. Trần 0.10, đã trả 0.08, đoạn 5 đang gửi đi thì đoạn 6 vẫn được bắt đầu → trả 0.12. Khoản tóm tắt 0.05 cũng không bị kiểm tra.
   - **Sửa:** tính `cam kết = đã trả + đang chờ`; chỉ bắt đầu đoạn mới khi `cam kết + giá đoạn + giá tóm tắt ≤ trần` (giữ chỗ cho bản tóm tắt).
   - **Nếu bỏ qua:** tính năng "tự dừng khi chạm trần" (MVP #6) sai ngay trong video demo.

3. **Ai cũng gọi được `/api/receipt` miễn phí** (`src/server.mjs`)
   - **Vấn đề:** route ghi on-chain không có thanh toán, không giới hạn. Một vòng lặp gửi sessionId ngẫu nhiên sẽ đốt sạch AVAX của ví operator.
   - **Sửa:** ghi biên lai ngay bên trong route có trả tiền `/api/summary`. Nếu ghi lỗi, server giữ lại và cho thử lại qua `/api/receipt/retry` chỉ với phiên đã trả tiền tóm tắt.
   - **Nếu bỏ qua:** sáng Demo Day ví operator hết gas, receipt không ghi được.

4. **Biên lai chứa giao dịch giả** (`App.jsx` `processAudioChunk`)
   - **Vấn đề:** không đọc được `PAYMENT-RESPONSE` thì gán hash `0x000…0` rồi vẫn đưa vào receipt, nên receipt "chứng minh" một khoản chưa từng được trả.
   - **Sửa:** đoạn không có txHash bị đánh dấu "chưa xác nhận thanh toán" và không đi vào receipt.

5. **Thứ tự transcript và receipt phụ thuộc mạng** (`App.jsx`)
   - **Vấn đề:** đoạn 2 trả về trước đoạn 1 thì hiện trước, và chuỗi hash receipt tính theo thứ tự trả về. Không ai tính lại được cùng một hash.
   - **Sửa:** sắp xếp theo `index` trước khi hiển thị và trước khi băm.

6. **"Tạo ví mới" xóa luôn USDC** (`App.jsx`, `x402Client.js`)
   - **Vấn đề:** khóa phiên bị ghi đè, USDC còn trong ví cũ mất vĩnh viễn.
   - **Sửa:** hỏi xác nhận kèm số dư hiện tại trước khi tạo ví mới.

7. **Gửi lại sessionId cũ → contract revert** (`App.jsx`)
   - **Vấn đề:** `sessionId` chỉ đổi khi tải lại trang. Họp phiên thứ hai rồi tóm tắt → `require(receiptOf[sessionId]==0)` báo `exists`.
   - **Sửa:** tạo sessionId mới mỗi lần bắt đầu phiên.

8. **Giá ở client và server không khớp** (`App.jsx` hằng 0.02/0.05, server đọc `PRICE_TRANSCRIBE`)
   - **Vấn đề:** đặt `PRICE_TRANSCRIBE=0.005` cho video 15 giây (như guideline gợi ý) thì giao diện vẫn trừ 0.02.
   - **Sửa:** thêm `GET /api/config` trả giá, mạng, explorer; client chỉ dùng số này.

9. **Không deploy được thành một link** (`src/server.mjs`)
   - **Vấn đề:** server không phục vụ `client/dist`. Muốn có HTTPS cùng origin thì phải chạy hai thứ.
   - **Sửa:** `express.static(client/dist)` và trả `index.html` cho các đường dẫn còn lại.

10. **Receipt luôn ghi lên Fuji** (`src/server.mjs` `/api/receipt`)
    - **Vấn đề:** dùng `avalancheFuji` cố định, bỏ qua `NET` và `RPC_URL`.
    - **Sửa:** dùng `NET.chain` và `NET.rpc`.

## Nên sửa

11. **Đoạn lỗi bị vứt bỏ** (`App.jsx`)
    - **Vấn đề:** STT hoặc settle lỗi thì đoạn âm thanh biến mất; guideline yêu cầu "thử lại một lần, hiện rõ phút nào chưa tính tiền".
    - **Sửa:** tự thử lại một lần với chữ ký mới, sau đó giữ đoạn ở trạng thái "lỗi, chưa trừ tiền" kèm nút thử lại.

12. **Đoạn cuối quá ngắn vẫn bị tính 0.02** (`App.jsx`)
    - **Vấn đề:** bấm dừng 0,5 giây sau khi đoạn mới bắt đầu → trả 0.02 cho im lặng.
    - **Sửa:** bỏ đoạn dưới 2 giây.

13. **Client không ghim phiên bản x402** (`client/package.json`)
    - **Vấn đề:** `^2.28.0` cho phép 2.29+, trong khi server ghim `~2.28.0` và README cảnh báo thư viện đổi nhanh.
    - **Sửa:** ghim `~2.28.0`.

14. **Không ai tự tính lại được receipt** (thiếu test và công cụ)
    - **Vấn đề:** pitch nói "ai cũng kiểm chứng được" nhưng công thức hash chỉ nằm trong route.
    - **Sửa:** tách thành `src/receipt.mjs`, thêm test `npm test` và script `npm run verify-receipt` đọc contract và so sánh.

## Gọn hơn

15. **File template thừa** (`client/src/assets/*`, `App.css`, `index.css` template Vite, `public/icons.svg`) — xóa, thay bằng CSS của giao diện mới.

**Kết luận:** sửa 1–3 trước, vì chúng làm hỏng đúng ba thứ giám khảo chấm kỹ nhất: link explorer, trần ngân sách, receipt.

**Chưa kiểm tra:** chưa chạy giao dịch thật trên Fuji (cần khóa ví và USDC test của nhóm), chưa gọi Groq thật (cần `GROQ_API_KEY`).

**Giới hạn còn lại (chưa sửa, cần nói trong pitch):** server tin danh sách txHash do trình duyệt gửi lên. Bản đầy đủ nên đọc sự kiện `Transfer` của USDC để đối chiếu trước khi ghi receipt.

## Lần rà thứ hai (sau khi nhóm thêm chế độ Phỏng vấn và sửa lời thoại)

16. **Sửa lời thoại làm receipt báo "Không khớp"** (`client/src/hooks/useMeeting.js`)
    - **Vấn đề:** `editChunk` ghi đè `text`, trong khi nút Kiểm chứng và biên lai `.json` tính hash từ `text`. Sửa một chữ là demo báo lệch với chain.
    - **Sửa:** giữ nguyên `text` (bản AI nghe được, đã trả tiền) cho receipt; bản sửa nằm ở `edited` và chỉ dùng cho bản tóm tắt.

17. **Đoạn code hỏng trong `Brand()`** (`client/src/App.jsx`)
    - **Vấn đề:** hàm `editChunk` gọi `update` và `textHash` không tồn tại, trả về bằng toán tử dấu phẩy. Chạy được chỉ vì không ai gọi nó.
    - **Sửa:** xóa.

18. **Ép tiếng Việt cho mọi cuộc họp, `STT_PROMPT` không còn dùng** (`src/server.mjs`)
    - **Vấn đề:** `language: "vi"` viết cứng làm hỏng cuộc họp tiếng Anh, còn `.env.example` vẫn hướng dẫn `STT_PROMPT` đã bỏ.
    - **Sửa:** thay bằng `STT_LANGUAGE` (mặc định `vi`, để trống thì Whisper tự nhận).

19. **Nhãn bảng sai ở chế độ Phỏng vấn trên điện thoại, nút chép im lặng khi lỗi** (`ResultPanel.jsx`)
    - **Sửa:** nhãn theo chế độ (Tiêu chí, Điểm, Hỏi thêm); nút chép báo "Không chép được" khi trình duyệt chặn clipboard.

20. **Tương phản** (`styles.css`): chữ đỏ nhỏ 4.05:1 và chữ trắng trên nút ghi 3.99:1, dưới mức 4.5:1 của WCAG AA. Đã đổi thành 6.0:1 và 5.45:1.
