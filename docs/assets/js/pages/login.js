export function loginForm() {
  return {
    email: '',
    password: '',
    loading: false,
    errorMessage: '',
    init() {
      if (new URLSearchParams(window.location.search).get('reason') === 'disabled') {
        this.errorMessage = 'このアカウントは無効化されています。管理者にお問い合わせください。';
      }
    },
    async submit() {
      this.loading = true;
      this.errorMessage = '';
      try {
        const { loginWithPassword } = await import('../auth.js');
        await loginWithPassword(this.email, this.password);
        window.location.href = './measurements.html';
      } catch (error) {
        console.error(error);
        this.errorMessage = 'ログインに失敗しました。メールアドレスとパスワードを確認してください。';
      } finally {
        this.loading = false;
      }
    }
  };
}
