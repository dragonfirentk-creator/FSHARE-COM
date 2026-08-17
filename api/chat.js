// ==================================================================
// SERVERLESS FUNCTION - "TRUNG GIAN" GIỮA TRÌNH DUYỆT VÀ GROK (xAI) API
// ------------------------------------------------------------------
// File này chạy trên SERVER của Vercel (không chạy trong trình duyệt),
// nên có thể giữ XAI_API_KEY bí mật mà không sợ ai lấy trộm bằng cách
// mở DevTools trên web. Trình duyệt chỉ gọi vào /api/chat (chính
// website của mình), rồi file này mới gọi tiếp sang xAI (Grok).
//
// CÁCH DÙNG:
// 1. Đặt file này đúng đường dẫn: api/chat.js (ngang hàng thư mục
//    chứa index.html, Vercel sẽ tự nhận diện thành 1 serverless function).
// 2. Lấy API key thật tại https://console.x.ai (mục API Keys).
// 3. Vào Vercel Dashboard -> chọn project "fairshare-flax" -> Settings
//    -> Environment Variables -> thêm biến tên XAI_API_KEY, giá trị
//    là API key thật vừa lấy ở bước 2.
// 4. Vào tab Deployments -> bấm "Redeploy" ở bản mới nhất (biến môi
//    trường mới KHÔNG tự áp dụng vào bản đang chạy, phải deploy lại).
// ==================================================================

// Vercel sẽ tự động chạy hàm này mỗi khi có request gửi tới /api/chat
export default async function handler(req, res) {
  // Chỉ chấp nhận phương thức POST, các phương thức khác thì từ chối
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Chỉ hỗ trợ phương thức POST.' });
  }

  // Lấy API key bí mật từ biến môi trường đã cấu hình trên Vercel
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    // Nếu chưa cấu hình biến môi trường thì báo lỗi rõ ràng để dễ debug
    return res.status(500).json({
      error: 'Server chưa được cấu hình XAI_API_KEY. Vào Vercel Dashboard > Settings > Environment Variables để thêm, rồi Redeploy lại.'
    });
  }

  try {
    // Lấy dữ liệu (system prompt + lịch sử hội thoại) mà trình duyệt gửi lên
    const { system, messages } = req.body;

    // Kiểm tra dữ liệu đầu vào cơ bản trước khi gọi API thật
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Thiếu dữ liệu messages hợp lệ.' });
    }

    // API của xAI (Grok) theo đúng chuẩn OpenAI: system prompt phải nằm
    // NGAY TRONG mảng messages (role: "system"), khác với Anthropic (system
    // là 1 trường riêng) - nên ta ghép nó vào đầu mảng trước khi gửi đi.
    const grokMessages = [
      { role: 'system', content: system || '' },
      ...messages
    ];

    // Gọi sang API thật của xAI (Grok), lần này có đính kèm API key hợp lệ
    const grokResponse = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey   // xAI xác thực bằng Bearer token, khác với Anthropic dùng header x-api-key
      },
      body: JSON.stringify({
        model: 'grok-4',       // model hiện hành của xAI - nếu xAI đổi tên model trong tương lai, cập nhật lại dòng này theo docs.x.ai
        max_tokens: 1000,      // giới hạn độ dài phản hồi
        messages: grokMessages // toàn bộ hội thoại kèm system prompt
      })
    });

    const rawData = await grokResponse.json(); // đọc kết quả thô từ xAI (định dạng khác Anthropic)

    if (!grokResponse.ok) {
      // Chuyển tiếp nguyên lỗi thật từ xAI để dễ debug (ví dụ sai API key, hết credit...)
      return res.status(grokResponse.status).json({ error: rawData.error || rawData });
    }

    // CHUẨN HOÁ định dạng phản hồi: Grok trả lời ở rawData.choices[0].message.content
    // (một chuỗi), trong khi giao diện web đang được viết theo định dạng của Anthropic
    // (rawData.content là 1 mảng các khối {type, text}) - nên ta "đóng gói" lại câu trả
    // lời của Grok vào đúng hình dạng đó để không phải sửa lại code phía trình duyệt.
    const replyText = rawData.choices && rawData.choices[0] && rawData.choices[0].message
      ? rawData.choices[0].message.content
      : '';

    return res.status(200).json({
      content: [ { type: 'text', text: replyText } ]
    });

  } catch (err) {
    // Bắt mọi lỗi bất ngờ (mất mạng, lỗi parse...) để trả về thông báo rõ ràng thay vì sập server
    console.error('Lỗi gọi Grok API:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ khi gọi trợ lý AI, vui lòng thử lại sau.' });
  }
}
