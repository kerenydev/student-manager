const state = {
  teacher: null,
  students: [],
  currentStudent: null,
  assignments: []
};

const $ = (id) => document.getElementById(id);

const api = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'אירעה שגיאה');
  }

  return data;
};

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');

  clearTimeout(window.toastTimer);

  window.toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 2200);
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(x => x[0])
    .join('')
    .toUpperCase();
}

$('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('teacher');
  window.location.replace('login.html');
});

async function loadStudents() {
  state.students = await api(
    `/api/students?teacherId=${state.teacher.id}`
  );

  renderStudents();
  await updateStats();
}

function renderStudents(filter = '') {
  const list = $('studentsList');
  list.innerHTML = '';

  const filtered = state.students.filter(student =>
    student.name.toLowerCase().includes(filter.toLowerCase())
  );

  $('studentsEmpty').classList.toggle(
    'hidden',
    filtered.length !== 0
  );

  filtered.forEach(student => {
    const card = document.createElement('article');
    card.className = 'student-card';

    card.innerHTML = `
      <div class="student-card-top">
        <div class="avatar">${initials(student.name)}</div>
        <div>
          <h3>${escapeHtml(student.name)}</h3>
          <small>כיתה ${escapeHtml(student.className)}</small>
        </div>
      </div>

      <div class="student-meta">
        <span>📞 ${escapeHtml(student.phone)}</span>
        <span>פתיחת פרופיל ←</span>
      </div>
    `;

    card.addEventListener('click', () => openStudent(student.id));
    list.appendChild(card);
  });

  $('studentsCount').textContent = state.students.length;
}

async function updateStats() {
  const results = await Promise.all(
    state.students.map(student =>
      api(`/api/students/${student.id}/assignments`)
    )
  );

  const assignments = results.flat();

  $('openAssignmentsCount').textContent =
    assignments.filter(a => a.status === 'todo').length;

  const grades = assignments
    .map(a => a.grade)
    .filter(g => g !== null && g !== undefined);

  $('avgGrade').textContent = grades.length
    ? Math.round(
        grades.reduce((sum, grade) => sum + grade, 0) / grades.length
      )
    : '—';
}

$('studentSearch').addEventListener('input', e => {
  renderStudents(e.target.value);
});

$('addStudentBtn').addEventListener('click', () => {
  openStudentDialog();
});

$('editStudentBtn').addEventListener('click', () => {
  openStudentDialog(state.currentStudent);
});

function openStudentDialog(student = null) {
  $('studentForm').reset();
  $('studentId').value = student?.id || '';

  $('studentDialogTitle').textContent =
    student ? 'עריכת תלמיד' : 'תלמיד חדש';

  if (student) {
    $('studentName').value = student.name;
    $('studentClass').value = student.className;
    $('studentPhone').value = student.phone;
  }

  $('studentDialog').showModal();
}

document.querySelectorAll('.close-dialog').forEach(button => {
  button.addEventListener('click', () => {
    $('studentDialog').close();
  });
});

$('studentForm').addEventListener('submit', async e => {
  e.preventDefault();

  const id = $('studentId').value;

  const payload = {
    teacherId: state.teacher.id,
    name: $('studentName').value,
    className: $('studentClass').value,
    phone: $('studentPhone').value
  };

  try {
    if (id) {
      await api(`/api/students/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await api('/api/students', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    $('studentDialog').close();

    await loadStudents();

    if (id && state.currentStudent?.id === Number(id)) {
      await openStudent(Number(id));
    }

    toast(
      id
        ? 'פרטי התלמיד עודכנו'
        : 'התלמיד נוסף בהצלחה'
    );
  } catch (err) {
    toast(err.message);
  }
});

async function openStudent(id) {
  state.currentStudent = await api(`/api/students/${id}`);

  state.assignments = await api(
    `/api/students/${id}/assignments`
  );

  $('studentsPage').classList.add('hidden');
  $('studentPage').classList.remove('hidden');
  $('addStudentBtn').classList.add('hidden');

  $('pageTitle').textContent = 'פרטי תלמיד';
  $('profileName').textContent = state.currentStudent.name;

  $('profileMeta').textContent =
    `כיתה ${state.currentStudent.className} · ${state.currentStudent.phone}`;

  $('studentAvatar').textContent =
    initials(state.currentStudent.name);

  renderAssignments();
}

$('backBtn').addEventListener('click', async () => {
  $('studentPage').classList.add('hidden');
  $('studentsPage').classList.remove('hidden');
  $('addStudentBtn').classList.remove('hidden');

  $('pageTitle').textContent = 'התלמידים שלי';

  state.currentStudent = null;

  await loadStudents();
});

function renderAssignments() {
  const body = $('assignmentsBody');
  body.innerHTML = '';

  $('assignmentsEmpty').classList.toggle(
    'hidden',
    state.assignments.length !== 0
  );

  state.assignments.forEach(assignment => {
    const row = document.createElement('tr');

    const statusText =
      assignment.status === 'submitted'
        ? 'הוגשה'
        : 'לביצוע';

    const grade =
      assignment.grade === null ||
      assignment.grade === undefined
        ? '<span class="grade empty">טרם נבדקה</span>'
        : `<span class="grade">${assignment.grade}</span>`;

    row.innerHTML = `
      <td><strong>${escapeHtml(assignment.title)}</strong></td>
      <td>${formatDate(assignment.dueDate)}</td>
      <td>
        <span class="status-pill ${assignment.status}">
          ${statusText}
        </span>
      </td>
      <td>${grade}</td>
      <td><button class="edit-link">עריכה</button></td>
    `;

    row
      .querySelector('.edit-link')
      .addEventListener('click', () => {
        openAssignmentDialog(assignment);
      });

    body.appendChild(row);
  });
}

$('addAssignmentBtn').addEventListener('click', () => {
  openAssignmentDialog();
});

function openAssignmentDialog(assignment = null) {
  $('assignmentForm').reset();
  $('assignmentId').value = assignment?.id || '';

  $('assignmentDialogTitle').textContent =
    assignment ? 'עריכת מטלה' : 'מטלה חדשה';

  if (assignment) {
    $('assignmentTitle').value = assignment.title;
    $('assignmentDueDate').value = assignment.dueDate;
    $('assignmentStatus').value = assignment.status;
    $('assignmentGrade').value = assignment.grade ?? '';
  }

  $('assignmentDialog').showModal();
}

document
  .querySelectorAll('.close-assignment-dialog')
  .forEach(button => {
    button.addEventListener('click', () => {
      $('assignmentDialog').close();
    });
  });

$('assignmentForm').addEventListener('submit', async e => {
  e.preventDefault();

  const id = $('assignmentId').value;

  const payload = {
    title: $('assignmentTitle').value,
    dueDate: $('assignmentDueDate').value,
    status: $('assignmentStatus').value,
    grade: $('assignmentGrade').value
  };

  try {
    if (id) {
      await api(`/api/assignments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await api(
        `/api/students/${state.currentStudent.id}/assignments`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );
    }

    $('assignmentDialog').close();

    state.assignments = await api(
      `/api/students/${state.currentStudent.id}/assignments`
    );

    renderAssignments();

    toast(
      id
        ? 'המטלה עודכנה'
        : 'המטלה נוספה בהצלחה'
    );
  } catch (err) {
    toast(err.message);
  }
});

function formatDate(date) {
  return new Intl.DateTimeFormat('he-IL').format(
    new Date(`${date}T00:00:00`)
  );
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    char =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[char]
  );
}

const savedTeacher = sessionStorage.getItem('teacher');

if (savedTeacher) {
  state.teacher = JSON.parse(savedTeacher);
  $('teacherName').textContent = state.teacher.name;
  loadStudents();
} else {
  window.location.replace('login.html');
}
