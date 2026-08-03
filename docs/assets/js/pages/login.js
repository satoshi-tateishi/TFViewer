export function loginForm() {
  return {
    email: '',
    password: '',
    loading: false,
    errorMessage: '',
    async submit() {
      this.loading = true;
      this.errorMessage = '';
      try {
        const { loginWithPassword } = await import('../auth.js');
        await loginWithPassword(this.email, this.password);
        window.location.href = './dashboard.html';
      } catch (error) {
        console.error(error);
        this.errorMessage = 'ログインに失敗しました。メールアドレスとパスワードを確認してください。';
      } finally {
        this.loading = false;
      }
    }
  };
}
