# Kịch Bản Test Demo OWASP Mobile Top 10

Tài liệu này dùng để demo và test hai hệ thống:

- `secure-app` + `secure-backend`
- `insecure-app` + `insecure-backend`

Mục tiêu của tài liệu không chỉ là “test kỹ thuật”, mà còn để hỗ trợ demo theo kiểu:

1. người dùng thao tác gì
2. attacker hoặc người phân tích làm gì
3. dấu hiệu nào cho thấy app đang bị hack hoặc lộ dữ liệu
4. bản secure khác bản insecure ra sao

## 1. Chuẩn bị môi trường

### Dịch vụ cần chạy

- `secure-backend` tại `http://localhost:4001`
- `insecure-backend` tại `http://localhost:4002`
- `secure-app`
- `insecure-app`

### Tài khoản mẫu

- Alice: `alice@example.com` / `Str0ng!Pass`
- Bob: `bob@example.com` / `Banking!123`

### Công cụ nên mở sẵn khi demo

- Metro terminal của từng app
- Android Logcat hoặc Xcode logs
- Android Device File Explorer hoặc `adb shell`
- SQLite viewer nếu cần xem DB backend
- Trình duyệt hoặc Postman để gọi API trực tiếp

### Cách đọc kết quả demo

- `Secure expected`: kết quả mong đợi ở bản an toàn
- `Insecure expected`: kết quả mong đợi ở bản cố tình có lỗ hổng
- `Dấu hiệu bị hack`: bằng chứng cụ thể để bạn chỉ cho người xem thấy

## 2. Danh sách scenario

- `SC01` M1: Lộ credential và token
- `SC02` M2: Dependency và supply chain posture
- `SC03` M3: Truy cập dữ liệu người khác
- `SC04` M4: Nhập dữ liệu xấu nhưng hệ thống vẫn nhận
- `SC05` M5: Gửi dữ liệu nhạy cảm qua kênh không an toàn
- `SC06` M6: Thiếu kiểm soát quyền riêng tư
- `SC07` M7: Cấu hình binary yếu
- `SC08` M8: Lộ cấu hình và lỗi nội bộ
- `SC09` M9: Lưu dữ liệu nhạy cảm không an toàn
- `SC10` M10: Dùng crypto hoặc secret handling yếu

## 3. Scenario chi tiết

## SC01 - M1: Lộ Credential Và Token

### Mục tiêu

Chứng minh bản insecure làm lộ thông tin đăng nhập và token, còn bản secure thì không.

### Góc nhìn end user

Người dùng chỉ thực hiện đăng nhập bình thường.

### Test step

1. Mở `secure-app`.
2. Đăng nhập bằng tài khoản Alice.
3. Quan sát Metro log, Logcat hoặc Xcode logs.
4. Kiểm tra request gửi lên backend.
5. Lặp lại các bước trên với `insecure-app`.
6. Sau khi đăng nhập `insecure-app`, kiểm tra local storage của app.

### Secure expected

- Không có email, password, token hiện trong log.
- Token không đi trong query string.
- Session được lưu trong Keychain hoặc secure storage abstraction.

### Insecure expected

- Có log chứa email hoặc password lúc login.
- Token nằm trong query string `?token=...`.
- Token được lưu plaintext trong AsyncStorage.
- Hardcoded mock API key xuất hiện trong source.

### Dấu hiệu bị hack

- Mở log thấy credential hiện thẳng ra.
- Mở AsyncStorage thấy token đọc được bằng mắt thường.
- Chụp URL request có chứa token.

### Bằng chứng nên chụp

- ảnh log login insecure
- ảnh local storage có token
- ảnh request URL có `token`

## SC02 - M2: Dependency Và Supply Chain Posture

### Mục tiêu

Chứng minh bản secure có posture dependency chặt hơn, còn bản insecure dễ chấp nhận risk hơn cho mục đích demo.

### Góc nhìn end user

End user không nhìn thấy trực tiếp. Đây là scenario cho người demo hoặc reviewer.

### Test step

1. Mở `secure-app/package.json`, `secure-backend/package.json`.
2. Kiểm tra version dependency có pin rõ hay không.
3. Chạy `npm audit` trong `secure-app` và `secure-backend`.
4. Lặp lại cho `insecure-app` và `insecure-backend`.
5. So sánh posture dependency giữa hai bên.

### Secure expected

- Dependency versions được pin rõ.
- Có thể audit được và ghi nhận được risk hiện có.
- Không phụ thuộc vào version wildcard cho flow chính.

### Insecure expected

- Có thể chấp nhận một số posture yếu hơn cho mục đích demo.
- Có mô tả rõ đây là môi trường lab, không phải production.

### Dấu hiệu bị hack

Scenario này không phải hack trực tiếp khi dùng app.
Dấu hiệu chính là “bề mặt tấn công cao hơn” do dependency posture yếu.

### Bằng chứng nên chụp

- ảnh `package.json`
- kết quả `npm audit`
- ghi chú dependency nào là risk

## SC03 - M3: Truy Cập Dữ Liệu Người Khác

### Mục tiêu

Chứng minh bản insecure có lỗi authorization hoặc IDOR/BOLA, còn bản secure chặn được.

### Góc nhìn end user

Người dùng mở danh sách giao dịch và tài khoản như bình thường.

### Test step

1. Đăng nhập Alice trên `secure-app`.
2. Mở dashboard và transaction list.
3. Thử gọi API lấy transaction hoặc account của Bob thông qua backend secure.
4. Ghi nhận response.
5. Đăng nhập Alice trên `insecure-app`.
6. Mở dashboard và transaction list.
7. Kiểm tra xem dữ liệu của Bob có xuất hiện không.
8. Nếu cần, gọi trực tiếp API insecure để lấy transaction/account của Bob.

### Secure expected

- Alice chỉ thấy dữ liệu của Alice.
- Gọi dữ liệu Bob sẽ bị `401` hoặc `404`.
- Logout hoặc đổi mật khẩu sẽ revoke session đúng.

### Insecure expected

-?≥

- Alice nhìn thấy dữ liệu không thuộc về mình.
- Token cũ vẫn gọi API được sau khi logout.

### Bằng chứng nên chụp

- ảnh list transaction có data Bob
- ảnh response API lấy data Bob
- ảnh token cũ vẫn dùng được

## SC04 - M4: Nhập Dữ Liệu Xấu Nhưng Hệ Thống Vẫn Nhận

### Mục tiêu

Chứng minh bản secure validate input/output, còn bản insecure nhận payload xấu hoặc trả lỗi verbose.

### Góc nhìn end user

Người dùng nhập dữ liệu chuyển tiền và upload receipt.

### Test step

1. Trên `secure-app`, nhập:
   - amount âm
   - description chứa HTML như `<b>Pay rent</b>`
   - receipt file name không phải ảnh như `payload.js`
   - deep link không hợp lệ như `javascript:alert(1)`
2. Gửi request và quan sát phản hồi.
3. Lặp lại đúng các thao tác đó trên `insecure-app`.

### Secure expected

- Amount âm bị chặn.
- Receipt không phải ảnh bị từ chối.
- Deep link không hợp lệ bị reject.
- Description được sanitize hoặc reject.

### Insecure expected

- Request vẫn được gửi đi.
- Dữ liệu xấu có thể vào backend.
- Có thể trả lỗi verbose, lộ SQL hoặc stack trace.
- Giá trị bất thường vẫn được lưu hoặc phản chiếu ra UI.

### Dấu hiệu bị hack

- Payload xấu được nhận và hiển thị.
- Error message lộ internals.
- Nội dung HTML hoặc string nguy hiểm đi xuyên qua flow.

### Bằng chứng nên chụp

- ảnh form nhập dữ liệu xấu
- ảnh response lỗi verbose
- ảnh transaction/receipt chứa dữ liệu bất thường

## SC05 - M5: Gửi Dữ Liệu Nhạy Cảm Qua Kênh Không An Toàn

### Mục tiêu

Chứng minh bản insecure gửi token theo cách dễ bị lộ hơn, còn bản secure dùng header-based auth và transport posture chặt hơn.

### Góc nhìn end user

Người dùng đăng nhập và gọi dữ liệu như bình thường.

### Test step

1. Đăng nhập trên `secure-app`.
2. Quan sát network request.
3. Xác nhận token chỉ nằm trong header `Authorization`.
4. Kiểm tra cấu hình iOS/Android của secure app.
5. Đăng nhập trên `insecure-app`.
6. Quan sát network request.
7. Xác nhận token xuất hiện trong query string.
8. Kiểm tra ATS và manifest của insecure app.

### Secure expected

- Token không nằm trong URL.
- App đi theo posture transport chặt hơn.
- Config native không mở rộng vô lý.

### Insecure expected

- Token lộ trong URL.
- ATS iOS yếu hơn.
- Network posture lỏng hơn để phục vụ demo insecure.

### Dấu hiệu bị hack

- Token nhìn thấy ngay trên URL hoặc request inspector.
- Có thể chia sẻ URL và làm lộ token.

### Bằng chứng nên chụp

- ảnh request secure với bearer header
- ảnh request insecure có `?token=...`
- ảnh config ATS hoặc manifest liên quan

## SC06 - M6: Thiếu Kiểm Soát Quyền Riêng Tư

### Mục tiêu

Chứng minh bản secure yêu cầu consent rõ ràng và có data controls, còn bản insecure bỏ qua consent hoặc lộ thêm dữ liệu.

### Góc nhìn end user

Người dùng đăng nhập và vào profile.

### Test step

1. Mở `secure-app` ở màn hình login.
2. Xác nhận người dùng phải đồng ý privacy notice trước khi tiếp tục.
3. Vào Profile, thử export data và delete account.
4. Kiểm tra các permission description trong iOS plist.
5. Mở `insecure-app`.
6. Xác nhận app cho đi tiếp mà không cần consent.
7. Vào Profile và xem extra recipient hoặc extra data nếu có.
8. So sánh permission description giữa hai app.

### Secure expected

- Consent rõ ràng.
- Có flow export/delete.
- Permission rationale cụ thể, giới hạn.

### Insecure expected

- Bỏ qua consent.
- Có extra data hoặc extra recipient không cần thiết.
- Permission wording rộng hoặc mơ hồ.

### Dấu hiệu bị hack

- Người dùng không được hỏi nhưng dữ liệu vẫn bị thu.
- Xuất hiện recipient hoặc field ngoài mong đợi.

### Bằng chứng nên chụp

- ảnh màn hình consent secure
- ảnh insecure login không cần consent
- ảnh profile có extra recipient/data

## SC07 - M7: Binary Protection Yếu

### Mục tiêu

Chứng minh secure và insecure có posture hardening khác nhau ở mức config/build.

### Góc nhìn end user

End user không thấy trực tiếp. Scenario này dành cho người demo kỹ thuật.

### Test step

1. Kiểm tra `AndroidManifest.xml` của hai app.
2. So sánh `allowBackup`.
3. Kiểm tra các cấu hình iOS plist liên quan.
4. Ghi nhận các phần hardening đã có và phần nào còn pending.

### Secure expected

- `allowBackup="false"`.
- Config mặc định chặt hơn.
- Có hướng triển khai hardening rõ ràng hơn.

### Insecure expected

- `allowBackup="true"` hoặc posture yếu hơn.
- Config release hoặc transport lỏng hơn để phục vụ demo.

### Dấu hiệu bị hack

- Không thấy trực tiếp trong UI.
- Dấu hiệu chính là attacker có thêm điều kiện thuận lợi để trích xuất hoặc reverse app.

### Bằng chứng nên chụp

- ảnh manifest secure/insecure
- ảnh plist hoặc build config liên quan

## SC08 - M8: Lộ Cấu Hình Và Lỗi Nội Bộ

### Mục tiêu

Chứng minh secure backend trả lỗi an toàn, còn insecure backend trả lỗi làm lộ internals.

### Góc nhìn end user

Người dùng thao tác sai hoặc nhập request lỗi.

### Test step

1. Trên `secure-app`, gửi request transfer sai hoặc query sai.
2. Quan sát thông báo lỗi trả về.
3. Trên `insecure-app`, lặp lại cùng kiểu request xấu.
4. Quan sát response và log backend.

### Secure expected

- Lỗi gọn, generic.
- Không lộ stack trace, SQL, path nội bộ.

### Insecure expected

- Lỗi verbose.
- Có thể lộ SQL text, stack trace, hoặc chi tiết implementation.

### Dấu hiệu bị hack

- Chỉ cần nhìn message lỗi đã suy ra được internals của hệ thống.

### Bằng chứng nên chụp

- ảnh lỗi generic secure
- ảnh lỗi verbose insecure
- ảnh log backend insecure

## SC09 - M9: Lưu Dữ Liệu Nhạy Cảm Không An Toàn

### Mục tiêu

Chứng minh secure app không lưu dữ liệu nhạy cảm dưới dạng plaintext dễ đọc, còn insecure app thì có.

### Góc nhìn end user

Người dùng đăng nhập, xem dashboard, xem transaction.

### Test step

1. Đăng nhập `secure-app`.
2. Kiểm tra UI account number.
3. Kiểm tra cơ chế lưu session.
4. Đăng nhập `insecure-app`.
5. Kiểm tra AsyncStorage các key như:
   - `token`
   - `profile_cache`
   - `transactions_cache`
6. So sánh cách hiển thị account number trên UI.

### Secure expected

- Account number bị mask.
- Không có plaintext token trong AsyncStorage.
- Session đi qua secure storage abstraction.

### Insecure expected

- Token/profile/transactions cache nằm plaintext.
- UI ít che dữ liệu hơn.

### Dấu hiệu bị hack

- Chỉ cần mở local storage đã đọc được dữ liệu nhạy cảm.

### Bằng chứng nên chụp

- ảnh storage secure/insecure
- ảnh UI masked vs less-masked

## SC10 - M10: Crypto Hoặc Secret Handling Yếu

### Mục tiêu

Chứng minh secure backend dùng token signing và password hashing mạnh hơn, còn insecure side vẫn có secret handling yếu và predictable hơn.

### Góc nhìn end user

End user không thấy trực tiếp. Đây là scenario cho người demo hoặc reviewer.

### Test step

1. Mở `secure-backend/src/security.js`.
2. Kiểm tra password hashing.
3. Kiểm tra access token signing.
4. Mở `insecure-backend/src/security.js` và `insecure-app/App.tsx`.
5. Kiểm tra static token và hardcoded key.

### Secure expected

- Password hash dùng PBKDF2 với salt và iteration cao.
- Access token dùng RSA/RS256.

### Insecure expected

- Static token dễ đoán.
- Hardcoded secret material xuất hiện trong source.
- Operational secret handling yếu hơn.

### Dấu hiệu bị hack

- Token có pattern cố định, đoán được.
- Secret hoặc key nằm lộ trong source.

### Bằng chứng nên chụp

- ảnh file security secure
- ảnh static token insecure
- ảnh hardcoded key trong insecure app

## 4. Cách demo theo flow dễ hiểu

Nếu bạn demo trước audience không quá kỹ thuật, nên dùng flow sau cho mỗi scenario:

1. Mở secure app và thao tác như end user.
2. Nói ngắn gọn “người dùng không thấy gì bất thường, và đó là điều đúng”.
3. Mở insecure app và thao tác y hệt.
4. Chuyển sang log, storage, request hoặc response để chỉ bằng chứng lỗ hổng.
5. Kết lại bằng một câu so sánh:
   - “Cùng một thao tác người dùng, nhưng bản insecure đã làm lộ ...”

## 5. Checklist ghi nhận kết quả demo

Cho mỗi scenario, bạn nên ghi lại:

- `Scenario ID`
- `Đã test trên secure-app chưa`
- `Đã test trên insecure-app chưa`
- `Kết quả secure`
- `Kết quả insecure`
- `Bằng chứng đã chụp`
- `Có tái hiện được lỗ hổng không`
- `Ghi chú thêm`

## 6. Kết luận khi trình bày

Thông điệp nên chốt sau mỗi nhóm test:

- Người dùng cuối thường không tự biết mình đang bị hack.
- Lỗ hổng mobile đa phần là “silent”.
- Muốn phát hiện, phải nhìn thêm vào:
  - log
  - network request
  - local storage
  - backend response
  - native config
- Đó là lý do secure implementation quan trọng, dù UI nhìn có thể rất giống nhau.
