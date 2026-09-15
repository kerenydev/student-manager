const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const db = new DatabaseSync(
  path.join(__dirname, 'students.db')
);

db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    national_id TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    FOREIGN KEY (teacher_id)
      REFERENCES teachers(id)
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL
      CHECK(status IN ('todo', 'submitted')),
    grade INTEGER
      CHECK(
        grade IS NULL OR
        (grade >= 0 AND grade <= 100)
      ),
    FOREIGN KEY (student_id)
      REFERENCES students(id)
      ON DELETE CASCADE
  );
`);

function seedDatabase() {
  const existingTeacher = db
    .prepare(
      'SELECT id FROM teachers WHERE national_id = ?'
    )
    .get('123456789');

  let teacherId = existingTeacher?.id;

  if (!teacherId) {
    const result = db
      .prepare(
        'INSERT INTO teachers (name, national_id) VALUES (?, ?)'
      )
      .run(
        'Keren Yissachar',
        '123456789'
      );

    teacherId = Number(result.lastInsertRowid);
  }

  const studentCount = db
    .prepare(
      'SELECT COUNT(*) AS count FROM students WHERE teacher_id = ?'
    )
    .get(teacherId)
    .count;

  if (studentCount > 0) {
    return;
  }

  const insertStudent = db.prepare(`
    INSERT INTO students
      (teacher_id, name, class_name, phone)
    VALUES (?, ?, ?, ?)
  `);

  const ellaId = Number(
    insertStudent.run(
      teacherId,
      'אלה כהן',
      'ו׳1',
      '050-555-1111'
    ).lastInsertRowid
  );

  insertStudent.run(
    teacherId,
    'אלון לוי',
    'ו׳2',
    '050-555-2222'
  );

  insertStudent.run(
    teacherId,
    'ישראל ישראלי',
    'ו׳2',
    '050-555-3333'
  );

  const insertAssignment = db.prepare(`
    INSERT INTO assignments
      (student_id, title, due_date, status, grade)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertAssignment.run(
    ellaId,
    'תרגילי כפל',
    '2026-09-01',
    'submitted',
    94
  );

  insertAssignment.run(
    ellaId,
    'תרגילי חילוק',
    '2026-09-08',
    'todo',
    null
  );
}

seedDatabase();

function sendJson(res, status, data) {
  const body = JSON.stringify(data);

  res.writeHead(status, {
    'Content-Type':
      'application/json; charset=utf-8',
    'Content-Length':
      Buffer.byteLength(body)
  });

  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', chunk => {
      raw += chunk;

      if (raw.length > 1_000_000) {
        reject(
          new Error('Payload too large')
        );

        req.destroy();
      }
    });

    req.on('end', () => {
      if (!raw) {
        return resolve({});
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(
          new Error('Invalid JSON')
        );
      }
    });

    req.on('error', reject);
  });
}

function cleanString(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function parseGrade(value) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const grade = Number(value);

  return (
    Number.isInteger(grade) &&
    grade >= 0 &&
    grade <= 100
  )
    ? grade
    : NaN;
}

async function apiRoute(req, res, url) {
  try {

    if (
      req.method === 'POST' &&
      url.pathname === '/api/login'
    ) {
      const body = await parseBody(req);

      const name =
        cleanString(body.name);

      const nationalId =
        cleanString(body.nationalId);

      if (!name || !nationalId) {
        return sendJson(
          res,
          400,
          {
            error:
              'Name and ID are required'
          }
        );
      }

      const teacher = db
        .prepare(`
          SELECT
            id,
            name,
            national_id AS nationalId
          FROM teachers
          WHERE name = ?
            AND national_id = ?
        `)
        .get(name, nationalId);

      if (!teacher) {
        return sendJson(
          res,
          401,
          {
            error:
              'Invalid login details'
          }
        );
      }

      return sendJson(
        res,
        200,
        teacher
      );
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/students'
    ) {
      const teacherId = Number(
        url.searchParams.get('teacherId')
      );

      if (
        !Number.isInteger(teacherId) ||
        teacherId <= 0
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'teacherId is required'
          }
        );
      }

      const students = db
        .prepare(`
          SELECT
            id,
            name,
            class_name AS className,
            phone
          FROM students
          WHERE teacher_id = ?
          ORDER BY name
        `)
        .all(teacherId);

      return sendJson(
        res,
        200,
        students
      );
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/students'
    ) {
      const body = await parseBody(req);

      const teacherId =
        Number(body.teacherId);

      const name =
        cleanString(body.name);

      const className =
        cleanString(body.className);

      const phone =
        cleanString(body.phone);

      if (
        !teacherId ||
        !name ||
        !className ||
        !phone
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'All fields are required'
          }
        );
      }

      const result = db
        .prepare(`
          INSERT INTO students
            (
              teacher_id,
              name,
              class_name,
              phone
            )
          VALUES (?, ?, ?, ?)
        `)
        .run(
          teacherId,
          name,
          className,
          phone
        );

      return sendJson(
        res,
        201,
        {
          id:
            Number(
              result.lastInsertRowid
            ),
          name,
          className,
          phone
        }
      );
    }

    const studentMatch =
      url.pathname.match(
        /^\/api\/students\/(\d+)$/
      );

    if (
      studentMatch &&
      req.method === 'GET'
    ) {
      const studentId =
        Number(studentMatch[1]);

      const student = db
        .prepare(`
          SELECT
            id,
            teacher_id AS teacherId,
            name,
            class_name AS className,
            phone
          FROM students
          WHERE id = ?
        `)
        .get(studentId);

      if (!student) {
        return sendJson(
          res,
          404,
          {
            error:
              'Student not found'
          }
        );
      }

      return sendJson(
        res,
        200,
        student
      );
    }

    if (
      studentMatch &&
      req.method === 'PUT'
    ) {
      const id =
        Number(studentMatch[1]);

      const body =
        await parseBody(req);

      const name =
        cleanString(body.name);

      const className =
        cleanString(body.className);

      const phone =
        cleanString(body.phone);

      if (
        !name ||
        !className ||
        !phone
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'All fields are required'
          }
        );
      }

      const result = db
        .prepare(`
          UPDATE students
          SET
            name = ?,
            class_name = ?,
            phone = ?
          WHERE id = ?
        `)
        .run(
          name,
          className,
          phone,
          id
        );

      if (!result.changes) {
        return sendJson(
          res,
          404,
          {
            error:
              'Student not found'
          }
        );
      }

      return sendJson(
        res,
        200,
        {
          id,
          name,
          className,
          phone
        }
      );
    }

    const studentAssignmentsMatch =
      url.pathname.match(
        /^\/api\/students\/(\d+)\/assignments$/
      );

    if (
      studentAssignmentsMatch &&
      req.method === 'GET'
    ) {
      const studentId =
        Number(
          studentAssignmentsMatch[1]
        );

      const assignments = db
        .prepare(`
          SELECT
            id,
            student_id AS studentId,
            title,
            due_date AS dueDate,
            status,
            grade
          FROM assignments
          WHERE student_id = ?
          ORDER BY due_date
        `)
        .all(studentId);

      return sendJson(
        res,
        200,
        assignments
      );
    }

    if (
      studentAssignmentsMatch &&
      req.method === 'POST'
    ) {
      const studentId =
        Number(
          studentAssignmentsMatch[1]
        );

      const body =
        await parseBody(req);

      const title =
        cleanString(body.title);

      const dueDate =
        cleanString(body.dueDate);

      const status =
        cleanString(body.status);

      const grade =
        parseGrade(body.grade);

      const validDate =
        /^\d{4}-\d{2}-\d{2}$/.test(
          dueDate
        );

      const validStatus =
        ['todo', 'submitted']
          .includes(status);

      if (
        !title ||
        !validDate ||
        !validStatus ||
        Number.isNaN(grade)
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Invalid assignment data'
          }
        );
      }

      const student = db
        .prepare(
          'SELECT id FROM students WHERE id = ?'
        )
        .get(studentId);

      if (!student) {
        return sendJson(
          res,
          404,
          {
            error:
              'Student not found'
          }
        );
      }

      const result = db
        .prepare(`
          INSERT INTO assignments
            (
              student_id,
              title,
              due_date,
              status,
              grade
            )
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(
          studentId,
          title,
          dueDate,
          status,
          grade
        );

      return sendJson(
        res,
        201,
        {
          id:
            Number(
              result.lastInsertRowid
            ),
          studentId,
          title,
          dueDate,
          status,
          grade
        }
      );
    }

    const assignmentMatch =
      url.pathname.match(
        /^\/api\/assignments\/(\d+)$/
      );

    if (
      assignmentMatch &&
      req.method === 'PUT'
    ) {
      const id =
        Number(assignmentMatch[1]);

      const body =
        await parseBody(req);

      const title =
        cleanString(body.title);

      const dueDate =
        cleanString(body.dueDate);

      const status =
        cleanString(body.status);

      const grade =
        parseGrade(body.grade);

      const validDate =
        /^\d{4}-\d{2}-\d{2}$/.test(
          dueDate
        );

      const validStatus =
        ['todo', 'submitted']
          .includes(status);

      if (
        !title ||
        !validDate ||
        !validStatus ||
        Number.isNaN(grade)
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Invalid assignment data'
          }
        );
      }

      const result = db
        .prepare(`
          UPDATE assignments
          SET
            title = ?,
            due_date = ?,
            status = ?,
            grade = ?
          WHERE id = ?
        `)
        .run(
          title,
          dueDate,
          status,
          grade,
          id
        );

      if (!result.changes) {
        return sendJson(
          res,
          404,
          {
            error:
              'Assignment not found'
          }
        );
      }

      return sendJson(
        res,
        200,
        {
          id,
          title,
          dueDate,
          status,
          grade
        }
      );
    }

    return sendJson(
      res,
      404,
      {
        error: 'Not found'
      }
    );

  } catch (err) {
    console.error(err);

    if (!res.headersSent) {
      sendJson(
        res,
        500,
        {
          error:
            'Server error'
        }
      );
    }
  }
}

const mimeTypes = {
  '.html':
    'text/html; charset=utf-8',

  '.css':
    'text/css; charset=utf-8',

  '.js':
    'application/javascript; charset=utf-8'
};

function serveStatic(req, res, url) {
  const requested =
    url.pathname === '/'
      ? '/login.html'
      : url.pathname;

  const normalized =
    path
      .normalize(requested)
      .replace(
        /^(\.\.[/\\])+/,
        ''
      );

  const filePath =
    path.join(
      PUBLIC_DIR,
      normalized
    );

  if (
    !filePath.startsWith(
      PUBLIC_DIR
    )
  ) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(
    filePath,
    (err, stat) => {

      if (
        !err &&
        stat.isFile()
      ) {
        const extension =
          path.extname(filePath);

        const contentType =
          mimeTypes[extension] ||
          'application/octet-stream';

        res.writeHead(
          200,
          {
            'Content-Type':
              contentType
          }
        );

        return fs
          .createReadStream(
            filePath
          )
          .pipe(res);
      }

      res.writeHead(
        404,
        {
          'Content-Type':
            'text/plain; charset=utf-8'
        }
      );

      res.end('Not found');
    }
  );
}

const server =
  http.createServer(
    (req, res) => {

      const url = new URL(
        req.url,
        `http://${
          req.headers.host ||
          'localhost'
        }`
      );

      if (
        url.pathname
          .startsWith('/api/')
      ) {
        return apiRoute(
          req,
          res,
          url
        );
      }

      return serveStatic(
        req,
        res,
        url
      );
    }
  );

server.listen(
  PORT,
  () => {
    console.log(
      `ClassFlow running at http://localhost:${PORT}`
    );
  }
);
