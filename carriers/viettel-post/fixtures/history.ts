export const HISTORY_NUMBER = '000000000001';
export function historyFixture() {
  const scan = (code: number, clock: string, wording: string) => ({ MAVANDON: HISTORY_NUMBER, TRANG_THAI: code,
    THOI_GIAN: clock, STATUS_NAME: wording, GHI_CHU: wording, TINH: 'Synthetic province', TEN_BUUCUC_DI: 'Synthetic depot',
    NOI_DUNG: 'PRIVATE recipient prose', NHAN_VIEN_PHAT_DETAIL: { NAME: 'PRIVATE staff', PHONE: 'PRIVATE phone' },
    ADDRESS: 'PRIVATE street', time: 0, THOI_GIAN_16: 0 });
  return { status: 200, error: false, message: 'OK', messageKey: 'common.no_header', data: [{ MAVANDON: HISTORY_NUMBER,
    SHOW_ORDER: true, DICH_VU: 'Synthetic express', SENDER_FULLNAME: 'PRIVATE sender', RECEIVER_FULLNAME: 'PRIVATE recipient',
    EXPECTED_TIME: 'PRIVATE estimate', TRACKING_ORDERS: [
      { STATUS_NAME: 'Delivered', TRACKINGS: [scan(501, '08/04/2026 12:59:58', 'Phát thành công')] },
      { STATUS_NAME: 'Delivery', TRACKINGS: [scan(500, '08/04/2026 09:34:55', 'Phân công phát')] },
      { STATUS_NAME: 'Transit', TRACKINGS: [scan(400, '08/04/2026 07:10:42', 'Vận chuyển'), scan(300, '07/04/2026 05:58:54', 'Đóng gói đi')] },
      { STATUS_NAME: 'Accepted', TRACKINGS: [scan(202, '09/04/2026 08:23:31', 'Sửa phiếu gửi'), scan(200, '06/04/2026 15:06:00', 'Nhập doanh thu')] },
      { STATUS_NAME: 'Created', TRACKINGS: [scan(103, '06/04/2026 14:00:00', 'Giao cho bưu cục'), scan(100, '05/04/2026 16:41:53', 'Khách hàng tạo đơn')] },
    ] }] };
}
