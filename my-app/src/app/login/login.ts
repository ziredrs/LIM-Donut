import { Component, inject, signal, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  authService = inject(AuthService);
  router = inject(Router);
  route = inject(ActivatedRoute);

  isLoginMode = signal(true);
  username = signal('');
  email = signal('');
  password = signal('');
  confirmPassword = signal('');
  referralCode = signal('');
  submitted = signal(false);
  pending = signal(false);
  noticeMessage = signal('');
  @ViewChild('noticeDialog') noticeDialog!: ElementRef<HTMLDialogElement>;

  syncInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const fields = {
      username: this.username, email: this.email, password: this.password,
      confirmPassword: this.confirmPassword, referralCode: this.referralCode
    };
    const field = fields[input.name as keyof typeof fields];
    if (field && typeof input.value === 'string') field.set(input.value);
  }

  fieldError(field: string): string {
    switch (field) {
      case 'username':
        return !this.username().trim() ? 'Vui lòng nhập tên đăng nhập.' :
          !this.isLoginMode() && this.username().trim().length < 3 ? 'Tên đăng nhập phải có ít nhất 3 ký tự.' : '';
      case 'email':
        return !this.email().trim() ? 'Vui lòng nhập địa chỉ email.' :
          this.email().trim().length > 254 || this.email().trim().split('@')[0].length > 64 ||
          !/^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(this.email().trim())
            ? 'Email không đúng định dạng. Vui lòng nhập theo mẫu: ten@example.com.' : '';
      case 'password':
        return !this.password() ? 'Vui lòng nhập mật khẩu.' :
          !this.isLoginMode() && this.password().length < 6 ? 'Mật khẩu phải có ít nhất 6 ký tự.' : '';
      case 'confirmPassword':
        return !this.confirmPassword() ? 'Vui lòng nhập lại mật khẩu.' :
          this.confirmPassword() !== this.password() ? 'Mật khẩu nhập lại không khớp với mật khẩu.' : '';
      default: return '';
    }
  }

  showMessage(message: string) {
    this.noticeMessage.set(message);
    this.noticeDialog.nativeElement.showModal();
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['mode'] === 'register') {
        this.isLoginMode.set(false);
      } else {
        this.isLoginMode.set(true);
      }
    });
  }

  toggleMode() {
    this.isLoginMode.update(val => !val);
    this.submitted.set(false);
    this.confirmPassword.set('');
  }

  onSubmit(event: Event) {
    if (this.pending()) return;
    // Read the actual inputs too, including values filled by the browser/password manager.
    const values = new FormData(event.target as HTMLFormElement);
    this.username.set(String(values.get('username') || '').trim());
    this.email.set(String(values.get('email') || '').trim());
    this.password.set(String(values.get('password') || ''));
    this.confirmPassword.set(String(values.get('confirmPassword') || ''));
    this.referralCode.set(String(values.get('referralCode') || '').trim());
    this.submitted.set(true);
    const fields = this.isLoginMode() ? ['username', 'password'] : ['username', 'email', 'password', 'confirmPassword'];
    const invalidField = fields.find(field => this.fieldError(field));
    if (invalidField) {
      (event.target as HTMLFormElement).querySelector<HTMLInputElement>('#' + invalidField)?.focus();
      return;
    }
    this.pending.set(true);
    if (this.isLoginMode()) {
      this.authService.login({ username: this.username(), password: this.password() }).subscribe({
        next: () => {
          this.pending.set(false);
          this.router.navigateByUrl(this.route.snapshot.queryParams['returnUrl'] || '/');
        },
        error: err => {
          this.pending.set(false);
          this.showMessage(err.status === 0 ? 'Không thể kết nối máy chủ. Vui lòng thử lại.' : err.error?.message || 'Đăng nhập thất bại!');
        }
      });
    } else {
      this.authService.register({
        username: this.username(), email: this.email(), password: this.password(),
        referralCode: this.referralCode() || undefined
      }).subscribe({
        next: (res: any) => {
          this.pending.set(false);
          if (res?.referralDiscount) localStorage.setItem('pendingReferralDiscount', 'true');
          this.isLoginMode.set(true);
          this.password.set('');
          this.confirmPassword.set('');
          this.submitted.set(false);
          this.showMessage(res?.referralDiscount
            ? 'Đăng ký thành công! Bạn được giảm 15% cho đơn hàng đầu tiên. Hãy đăng nhập.'
            : 'Đăng ký thành công! Hãy đăng nhập.');
        },
        error: err => {
          this.pending.set(false);
          this.showMessage(err.status === 0 ? 'Không thể kết nối máy chủ. Vui lòng thử lại.' : err.error?.message || 'Đăng ký thất bại!');
        }
      });
    }
  }
}
