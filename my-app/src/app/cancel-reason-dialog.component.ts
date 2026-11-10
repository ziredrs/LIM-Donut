import { Component, DestroyRef, ElementRef, EventEmitter, Output, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Order, OrderService, DeliveryChangeQuote, OrderEditQuote } from './order.service';
import { PICKUP_HOURS, PICKUP_MINUTES } from './pickup-time.util';
import { environment } from '../environments/environment';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-cancel-reason-dialog', standalone: true, imports: [FormsModule, CommonModule],
  template: `
    <dialog #dialog aria-labelledby="cancelReasonTitle" (cancel)="busy() && $event.preventDefault()">
      <div class="heading"><h2 id="cancelReasonTitle">Hủy đơn hàng</h2><span>Đơn #{{ orderCode() }}</span></div>
      @if (success()) {
        <p class="success" role="status">Đã cập nhật đơn hàng thành công. Đơn hàng của bạn vẫn được giữ, không bị hủy.</p>
        <button type="button" (click)="dialog.close()">Đóng</button>
      } @else {
      <p>Lịm rất tiếc vì bạn muốn hủy đơn. Bạn có thể cho Lịm biết lý do được không?</p>
      <form (ngSubmit)="continue()">
        <fieldset><legend>Lý do hủy đơn</legend>
          @for (option of reasons; track option) {
            <label><input type="radio" name="reason" [disabled]="busy()" [value]="option" [ngModel]="reason()" (ngModelChange)="chooseReason($event)" required> {{ option }}</label>
          }
        </fieldset>
        @if (reason() === 'Lý do khác') { <label for="cancelNote">Phản hồi của bạn *</label> }
        <textarea id="cancelNote" name="note" [ngModel]="note()" (ngModelChange)="note.set($event)" maxlength="1000" [required]="reason() === 'Lý do khác'" placeholder="Ghi chú thêm (không bắt buộc nếu đã chọn lý do)" rows="3"></textarea>
        @if (reason() === reasons[0]) {
          <aside><strong>Đổi bánh / số lượng ngay trên đơn này</strong>
            <p>Giữ nguyên bánh để giữ topping cũ. Nếu đổi bánh, bánh mới dùng tùy chọn mặc định. Combo hiện có có thể đổi số lượng hoặc bỏ khỏi đơn.</p>
            @for (item of itemDrafts(); track $index; let i = $index) {
              <div class="item-edit-row">
                <div><label [for]="'editProduct' + i">Sản phẩm</label><select [id]="'editProduct' + i" [name]="'editProduct' + i" [disabled]="busy()" [ngModel]="item.productId" (ngModelChange)="editItem(i, {productId: +$event})">
                  <option [ngValue]="item.originalProductId">{{ item.originalName }}</option>
                  @for (product of catalog(); track product.id) { @if (product.id !== item.originalProductId) { <option [ngValue]="product.id">{{ product.name }}</option> } }
                </select></div>
                <div><label [for]="'editQty' + i">Số lượng</label><input class="address-input" type="number" [id]="'editQty' + i" [name]="'editQty' + i" [disabled]="busy()" min="1" max="1000" step="1" [ngModel]="item.quantity" (ngModelChange)="editItem(i, {quantity: +$event})"></div>
                <button type="button" class="remove-item" [disabled]="busy()" (click)="removeItem(i)" [attr.aria-label]="'Bỏ món ở dòng ' + (i + 1)" title="Bỏ món"><i class="bi bi-trash" aria-hidden="true"></i></button>
              </div>
            }
            <div class="item-edit-actions">
              <button type="button" [disabled]="busy() || !catalog().length" (click)="addItem()">+ Thêm bánh</button>
              <button type="button" [disabled]="busy() || !itemDrafts().length" (click)="previewEdit('items')">Kiểm tra đơn mới</button>
            </div>
          </aside>
        }
        @if (reason() === reasons[1]) {
          <aside><strong>Đổi khung giờ nhận ngay tại đây</strong><p>Giờ phục vụ: 07:00–21:00. Ngày nhận phải ở tương lai và đáp ứng thời gian đặt trước của gói bánh.</p>
            <div class="time-edit-row"><div><label for="editDate">Ngày nhận (dd/mm/yyyy)</label><input id="editDate" class="address-input" name="editDate" [disabled]="busy()" placeholder="dd/mm/yyyy" maxlength="10" [ngModel]="editDate()" (ngModelChange)="editDate.set($event); clearEdits()"></div>
              <div><label for="editHour">Giờ</label><select id="editHour" name="editHour" [disabled]="busy()" [ngModel]="editHour()" (ngModelChange)="editHour.set($event); editMinute.set('00'); clearEdits()">@for (hour of hours; track hour) { <option [value]="hour">{{ hour }}</option> }</select></div>
              <div><label for="editMinute">Phút</label><select id="editMinute" name="editMinute" [disabled]="busy()" [ngModel]="editMinute()" (ngModelChange)="editMinute.set($event); clearEdits()">@for (minute of editHour() === '21' ? ['00'] : minutes; track minute) { <option [value]="minute">{{ minute }}</option> }</select></div>
            </div><button type="button" [disabled]="busy()" (click)="previewEdit('time')">Kiểm tra giờ nhận mới</button>
          </aside>
        }
        @if (reason() === reasons[2]) {
          <aside><strong>Chuyển sang nhận tại cửa hàng</strong><p>Phí giao hàng sẽ được tính lại về 0đ. Hãy chọn chi nhánh và kiểm tra tổng mới trước khi xác nhận.</p>
            <label for="directPickupBranch">Chi nhánh nhận bánh</label><select id="directPickupBranch" name="directPickupBranch" [disabled]="busy()" [ngModel]="pickupBranch()" (ngModelChange)="pickupBranch.set($event); quote.set(null)">
              <option value="">Chọn chi nhánh</option>@for (branch of branches(); track branch._id) { <option [value]="branch._id">{{ branch.name }}: {{ branch.address }}</option> }
            </select><button type="button" [disabled]="busy()" (click)="previewChange()">Kiểm tra thông tin mới</button>
          </aside>
        }
        @if (reason() === reasons[0] || reason() === reasons[1]) {
          @if (changeError()) { <p class="error" role="alert">{{ changeError() }}</p> }
          @if (editQuote(); as preview) {
            <div class="preview" aria-live="polite"><strong>Thông tin mới — chưa cập nhật đơn</strong>
              @if (preview.deliveryTime) { <p>Giờ nhận mới: {{ preview.deliveryTime }}</p> }
              @for (item of preview.items || []; track $index) { <p>{{ item.name }} × {{ item.quantity }} — {{ item.price * item.quantity | number }}đ</p> }
              @if (preview.shippingFee != null) { <p>Phí giao hàng: {{ preview.shippingFee | number }}đ</p> }
              @if (preview.voucherDiscount) { <p>Giảm voucher: {{ preview.voucherDiscount | number }}đ</p> }
              @if (preview.starsReturned) { <p>Lịm Stars hoàn lại: {{ preview.starsReturned | number }}</p> }
              <p>Tổng thanh toán: {{ preview.oldTotalAmount | number }}đ → <strong>{{ preview.totalAmount | number }}đ</strong></p>
              @if (preview.depositAmount) { <p>Tiền cọc: {{ preview.depositAmount | number }}đ; còn lại: {{ preview.remainingAmount | number }}đ</p> }
              <button type="button" class="primary" [disabled]="busy()" (click)="confirmEdit()">Xác nhận cập nhật, giữ đơn hàng</button>
            </div>
          }
        }
        @if (reason() === reasons[2]) {
          @if (changeError()) { <p class="error" role="alert">{{ changeError() }}</p> }
          @if (quote(); as preview) {
            <div class="preview"><strong>Thông tin mới — chưa cập nhật đơn</strong><p>{{ preview.address }}</p><p>Chi nhánh: {{ preview.branchName }}</p>
              <p>Phí giao hàng: {{ preview.oldShippingFee | number }}đ → 0đ</p><p>Tổng: {{ preview.oldTotalAmount | number }}đ → {{ preview.totalAmount | number }}đ</p>
              @if (preview.depositAmount) { <p>Tiền cọc: {{ preview.depositAmount | number }}đ; còn lại: {{ preview.remainingAmount | number }}đ</p> }
              <button type="button" class="primary" [disabled]="busy()" (click)="confirmChange()">Xác nhận nhận tại cửa hàng, giữ đơn</button>
            </div>
          }
        }
        @if (reason() === 'Thay đổi địa chỉ nhận hàng') {
          <aside>
            <strong>Bạn có thể đổi địa chỉ mà không cần hủy đơn</strong>
            <p>Phí giao hàng sẽ được kiểm tra lại theo địa chỉ mới. Đơn chỉ được cập nhật sau khi bạn xác nhận.</p>
            <label for="newDeliveryAddress">Địa chỉ mới</label>
            <input id="newDeliveryAddress" class="address-input" type="text" name="newAddress" maxlength="500" [disabled]="busy()" [ngModel]="newAddress()" (ngModelChange)="changeAddress($event)" placeholder="Số nhà, đường, quận, thành phố">
            <p class="small">Ví dụ: 111A11 phố Nghĩa Tân, Cầu Giấy, Hà Nội. Vui lòng nhập đúng quận của địa chỉ mới.</p>
            <p><a [href]="mapSearchUrl()" target="_blank" rel="noopener noreferrer">Mở địa chỉ trên Google Maps</a></p>
            <label><input type="radio" name="newMethod" value="delivery" [disabled]="busy() || pickupOnly()" [ngModel]="method()" (ngModelChange)="changeMethod($event)"> Giao tới địa chỉ mới (tối đa 15 km)</label>
            <label><input type="radio" name="newMethod" value="pickup" [disabled]="busy()" [ngModel]="method()" (ngModelChange)="changeMethod($event)"> Nhận tại cửa hàng</label>
            @if (method() === 'pickup') {
              <label for="newPickupBranch">Chi nhánh nhận bánh</label>
              <select id="newPickupBranch" name="pickupBranch" [disabled]="busy()" [ngModel]="pickupBranch()" (ngModelChange)="pickupBranch.set($event); quote.set(null)">
                <option value="">Chọn chi nhánh</option>
                @for (branch of branches(); track branch._id) { <option [value]="branch._id">{{ branch.name }}: {{ branch.address }}</option> }
              </select>
            }
            <button type="button" [disabled]="busy()" (click)="previewChange()">{{ busy() ? 'Đang xử lý…' : 'Kiểm tra thông tin mới' }}</button>
            @if (changeError()) { <p class="error" role="alert">{{ changeError() }}</p> }
            @if (quote(); as preview) {
              <div class="preview" aria-live="polite">
                <p><strong>Thông tin nhận hàng mới</strong></p>
                <p>{{ preview.address }}</p><p>Chi nhánh: {{ preview.branchName }}</p>
                @if (preview.locationPrecision === 'street') {
                  <p class="small"><strong>Vị trí ước tính theo đường/ngõ như checkout, chưa xác định chính xác số nhà.</strong><br>{{ preview.resolvedAddress }}<br>Vui lòng kiểm tra địa chỉ bên trên trước khi xác nhận.</p>
                }
                @if (preview.deliveryMethod === 'delivery') {
                  <p>{{ preview.distanceSource === 'google-driving' ? 'Quãng đường ô tô (Google Maps)' : 'Khoảng cách ước tính theo tọa độ' }}: {{ preview.distanceKm | number:'1.1-1' }} km</p>
                  @if (preview.mapsUrl) { <p><a [href]="preview.mapsUrl" target="_blank" rel="noopener noreferrer">Xem tuyến đường trên Google Maps</a></p> }
                }
                <p>Phí giao hàng: {{ preview.oldShippingFee | number }}đ → <strong>{{ preview.shippingFee | number }}đ</strong></p>
                <p>Tổng thanh toán: {{ preview.oldTotalAmount | number }}đ → <strong>{{ preview.totalAmount | number }}đ</strong></p>
                @if (preview.depositAmount > 0) {
                  <p>{{ preview.depositPaid ? 'Đã đặt cọc' : 'Tiền cọc cần thanh toán' }}: {{ preview.depositAmount | number }}đ</p>
                  <p>Còn lại khi nhận: {{ preview.remainingAmount | number }}đ</p>
                }
                <button type="button" class="primary" [disabled]="busy()" (click)="confirmChange()">{{ preview.locationPrecision === 'street' ? 'Xác nhận địa chỉ và vị trí ước tính, giữ đơn' : 'Xác nhận cập nhật, giữ đơn hàng' }}</button>
              </div>
            }
            <p class="small">Nếu thông tin mới chưa phù hợp hoặc không thể cập nhật, bạn vẫn có thể tiếp tục hủy theo chính sách.</p>
          </aside>
        }
        <p class="policy">Tiền cọc đã thanh toán (nếu có) không được hoàn theo chính sách hủy đơn.</p>
        <div class="actions"><button type="button" [disabled]="busy()" (click)="dialog.close()">Giữ đơn hàng</button><button type="submit" class="primary" [disabled]="busy() || !reason() || (reason() === 'Lý do khác' && !note().trim())">Tiếp tục hủy đơn</button></div>
      </form>
      }
    </dialog>
  `,
  styles: [`
    dialog { position:fixed; inset:0; margin:auto; width:min(900px,calc(100% - 32px)); max-height:calc(100dvh - 40px); overflow:auto; border:0; border-radius:24px; padding:32px; color:#263343; background:white; box-shadow:0 20px 60px #0003; }
    dialog::backdrop { background:#0006; backdrop-filter:blur(4px); }
    .heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
    h2 { font:700 1.4rem var(--font-primary); margin:0; } .heading span { font-size:.85rem; background:#eff7fc; padding:5px 10px; border-radius:16px; }
    p { line-height:1.6; } fieldset { border:0; padding:0; margin:18px 0; } legend { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
    label { display:flex; gap:10px; align-items:center; margin:12px 0; } input { width:18px; height:18px; accent-color:#72add0; }
    textarea { box-sizing:border-box; width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px; font:inherit; resize:vertical; }
    aside { background:#f0f7fc; padding:16px; border-radius:12px; margin:18px 0; } aside p { margin:8px 0; } a { color:#287ec2; font-weight:600; }
    .policy { font-size:.85rem; color:#677483; margin-top:16px; } .actions { display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end; }
    button { padding:10px 18px; border:1px solid #cbd5e1; border-radius:22px; background:white; font:inherit; cursor:pointer; } button.primary { background:#72add0; border-color:#72add0; color:white; font-weight:600; } button:disabled { opacity:.5; cursor:default; }
    input.address-input, select { box-sizing:border-box; width:100%; height:auto; padding:10px; border:1px solid #cbd5e1; border-radius:8px; font:inherit; margin-bottom:12px; }
    .preview { padding:12px; margin-top:16px; border:1px solid #b8d9e9; border-radius:12px; background:white; } .error { color:#cf394c; } .success { color:#198754; } .small { font-size:.85rem; }
    .time-edit-row { display:grid; grid-template-columns:2fr 1fr 1fr; gap:12px; } .item-edit-row { display:grid; grid-template-columns:minmax(0,1fr) 110px 44px; align-items:end; gap:12px; padding-bottom:12px; border-bottom:1px solid #d8e6ef; margin-bottom:12px; }
    .item-edit-row .remove-item { width:44px; height:44px; padding:0; margin-bottom:12px; display:flex; align-items:center; justify-content:center; border-color:#f5d2d8; background:#fff1f2; color:#dc3545; border-radius:50%; font-size:1.15rem; }
    .item-edit-row select, .item-edit-row .address-input { height:44px; }
    .remove-item:hover:not(:disabled) { background:#ffe1e5; }
    .item-edit-actions { display:flex; flex-wrap:wrap; gap:16px; margin-top:16px; }
    @media(max-width:600px) { dialog { padding:20px; } .item-edit-row { grid-template-columns:minmax(0,1fr) 75px 44px; gap:8px; } }
  `]
})
export class CancelReasonDialogComponent {
  @ViewChild('dialog') dialog!: ElementRef<HTMLDialogElement>;
  @Output() confirmed = new EventEmitter<{ reason: string; note: string }>();
  @Output() deliveryUpdated = new EventEmitter<Order>();
  private orders = inject(OrderService);
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);
  private order?: Order;
  readonly reasons = ['Muốn đổi bánh / số lượng', 'Thời gian giao không phù hợp', 'Phí giao hàng cao', 'Thay đổi địa chỉ nhận hàng', 'Đặt nhầm đơn', 'Không còn nhu cầu', 'Lý do khác'];
  reason = signal(''); note = signal(''); orderCode = signal('');
  newAddress = signal(''); method = signal<'delivery' | 'pickup'>('delivery'); pickupBranch = signal('');
  branches = signal<{ _id: string; name: string; address: string; active: boolean }[]>([]);
  quote = signal<DeliveryChangeQuote | null>(null); pickupOnly = signal(false); busy = signal(false);
  changeError = signal(''); success = signal(false);
  editQuote = signal<OrderEditQuote | null>(null);
  editDate = signal(''); editHour = signal('07'); editMinute = signal('00');
  readonly hours = PICKUP_HOURS; readonly minutes = PICKUP_MINUTES;
  catalog = signal<{ id: number; name: string }[]>([]);
  itemDrafts = signal<{ sourceIndex: number | null; productId: number; quantity: number; originalProductId: number; originalName: string }[]>([]);
  open(order: Order) {
    this.order = order; this.orderCode.set(order.orderId); this.reason.set(''); this.note.set('');
    this.newAddress.set(order.deliveryMethod === 'pickup' ? '' : order.customerInfo.address);
    this.method.set('delivery'); this.pickupBranch.set(order.branchId || ''); this.quote.set(null); this.pickupOnly.set(false); this.changeError.set(''); this.success.set(false); this.editQuote.set(null);
    const date = order.customerInfo.deliveryTime?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
    const iso = order.customerInfo.deliveryTime?.match(/(\d{4})-(\d{2})-(\d{2})/);
    this.editDate.set(date || (iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : ''));
    const time = order.customerInfo.deliveryTime?.match(/(\d{2}):(\d{2})/);
    this.editHour.set(time?.[1] || '07'); this.editMinute.set(time?.[2] || '00');
    this.itemDrafts.set(order.items.map((item, sourceIndex) => ({ sourceIndex, productId: Number(String(item.id).split('_')[0]), quantity: item.quantity, originalProductId: Number(String(item.id).split('_')[0]), originalName: item.name })));
    this.dialog.nativeElement.showModal();
    this.http.get<{ _id: string; name: string; address: string; active: boolean }[]>(`${environment.apiBase}/api/branches`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rows => this.branches.set(rows.filter(branch => branch.active)),
      error: () => this.changeError.set('Không tải được danh sách chi nhánh. Vui lòng thử lại sau.')
    });
    this.http.get<{ id: number; name: string }[]>(`${environment.apiBase}/api/products`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rows => this.catalog.set(rows.filter(product => ![99, 100].includes(product.id))),
      error: () => this.changeError.set('Không tải được menu. Bạn vẫn có thể đổi số lượng bánh đang có hoặc thử lại sau.')
    });
  }
  chooseReason(value: string) { this.reason.set(value); this.quote.set(null); this.editQuote.set(null); this.changeError.set(''); if (value === this.reasons[2]) this.method.set('pickup'); }
  clearEdits() { this.editQuote.set(null); this.changeError.set(''); }
  editItem(index: number, patch: { productId?: number; quantity?: number }) { this.itemDrafts.update(items => items.map((item, i) => i === index ? { ...item, ...patch } : item)); this.clearEdits(); }
  removeItem(index: number) { this.itemDrafts.update(items => items.filter((_, i) => i !== index)); this.clearEdits(); }
  addItem() { const product = this.catalog()[0]; if (!product) return; this.itemDrafts.update(items => [...items, { sourceIndex: null, productId: product.id, originalProductId: product.id, originalName: product.name, quantity: 1 }]); this.clearEdits(); }
  previewEdit(kind: 'time' | 'items') {
    if (!this.order || this.busy()) return;
    this.busy.set(true); this.changeError.set(''); this.editQuote.set(null);
    const input = kind === 'time' ? { kind, date: this.editDate(), time: `${this.editHour()}:${this.editMinute()}` } : { kind, items: this.itemDrafts().map(({ sourceIndex, productId, quantity }) => ({ sourceIndex, productId, quantity })) };
    this.orders.quoteOrderEdit(this.order, input).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: quote => { this.busy.set(false); this.editQuote.set(quote); },
      error: err => { this.busy.set(false); this.changeError.set(err.error?.message || 'Không thể kiểm tra thay đổi. Vui lòng thử lại.'); }
    });
  }
  confirmEdit() {
    const quote = this.editQuote(); if (!quote || !this.order || this.busy()) return;
    this.busy.set(true); this.changeError.set('');
    this.orders.confirmOrderEdit(this.order, quote.token).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: order => { this.busy.set(false); this.success.set(true); this.editQuote.set(null); this.deliveryUpdated.emit(order); },
      error: err => { this.busy.set(false); this.editQuote.set(null); this.changeError.set(err.error?.message || 'Không thể cập nhật. Vui lòng kiểm tra lại.'); }
    });
  }
  changeAddress(value: string) { this.newAddress.set(value); this.quote.set(null); this.pickupOnly.set(false); this.changeError.set(''); }
  mapSearchUrl() { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(this.newAddress() || 'Lịm Donuts Hà Nội'); }
  changeMethod(value: 'delivery' | 'pickup') { this.method.set(value); this.quote.set(null); this.changeError.set(''); }
  previewChange() {
    if (!this.order || this.busy()) return;
    this.busy.set(true); this.changeError.set(''); this.quote.set(null);
    this.orders.quoteDeliveryChange(this.order, { address: this.newAddress(), branchId: this.pickupBranch(), deliveryMethod: this.method() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: quote => { this.busy.set(false); this.quote.set(quote); },
      error: err => {
        this.busy.set(false); this.changeError.set(err.error?.message || 'Không thể kiểm tra địa chỉ mới. Vui lòng thử lại.');
        if (err.error?.pickupOnly) { this.pickupOnly.set(true); this.method.set('pickup'); }
      }
    });
  }
  confirmChange() {
    const quote = this.quote(); if (!this.order || !quote || this.busy()) return;
    this.busy.set(true); this.changeError.set('');
    this.orders.confirmDeliveryChange(this.order, quote.token, quote.locationPrecision === 'street').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: order => { this.busy.set(false); this.success.set(true); this.quote.set(null); this.deliveryUpdated.emit(order); },
      error: err => { this.busy.set(false); this.quote.set(null); this.changeError.set(err.error?.message || 'Không thể cập nhật. Vui lòng kiểm tra lại.'); }
    });
  }
  continue() {
    if (this.busy() || !this.reason() || (this.reason() === 'Lý do khác' && !this.note().trim())) return;
    this.dialog.nativeElement.close();
    this.confirmed.emit({ reason: this.reason(), note: this.note().trim() });
  }
}
