const $ = (id) => document.getElementById(id);
const api = async (url, options = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'אירעה שגיאה');
  return data;
};

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';

  try {
    const teacher = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        name: $('loginName').value,
        nationalId: $('loginId').value
      })
    });

    sessionStorage.setItem('teacher', JSON.stringify(teacher));

    window.location.replace("app.html");

  } catch (err) {
    $('loginError').textContent = 'פרטי ההתחברות אינם נכונים.';
  }
});
