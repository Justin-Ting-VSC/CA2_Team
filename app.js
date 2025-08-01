const express = require('express');
const mysql = require('mysql2');
const session = require('express-session'); 
const flash = require('connect-flash');

const app = express();

//image 
const multer = require('multer');

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

// Database connection
const db = mysql.createConnection({
    host: 'dddgt5.h.filess.io',
    user: 'C237StudyBuddy_collegedie',
    password: '768f143d94d757f1499c22e82cd2786488a7d407',
    database: 'C237StudyBuddy_collegedie',
    port: 61002
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));

app.use(flash());

// EJS setup
app.set('view engine', 'ejs');

const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/dashboard');
    }
};

// Login - Register - admin dashboard - Index connection

app.get('/', (req, res) => {
    res.render('index', { user: req.session.user, messages: req.flash('success') });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact } = req.body;

    if (!username || !email || !password || !address || !contact) {
        return res.status(400).send('All fields are required.');
    }
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    db.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'Email is already registered.');
                req.flash('formData', req.body);
                return res.redirect('/register');
            }
            throw err;
        }
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    db.query(sql, [email, password], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            req.session.user = results[0];
            req.flash('success', 'Login successful!');
            res.redirect('/dashboard');
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

app.get('/dashboard', checkAuthenticated, async (req, res) => {
    try {
        const [subjects] = await db.promise().query('SELECT COUNT(*) AS total FROM subjects');
        const [exams] = await db.promise().query('SELECT COUNT(*) AS total FROM exams');
        const [groups] = await db.promise().query('SELECT COUNT(*) AS total FROM study_groups');

        res.render('dashboard', {
            user: req.session.user,
            stats: {
                subjects: subjects[0].total,
                exams: exams[0].total,
                studyGroups: groups[0].total
            },
            recentUpdates: [] // Add this line
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading dashboard.');
    }
});

app.get('/admin', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied');
  }

  db.query('SELECT * FROM users', (err, results) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).send('Error fetching users');
    }

    res.render('admin', {
      user: req.session.user,
      users: results
    });
  });
});

app.post('/editRole/:id', (req, res) => {
  const { role } = req.body;
  const userId = req.params.id;

  db.query('UPDATE users SET role = ? WHERE id = ?', [role, userId], (err) => {
    if (err) {
      console.error('Role update error:', err);
      return res.status(500).send('Error updating role');
    }
    res.redirect('/admin');
  });
});


app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

//hariz subjects
app.get('/subjects', checkAuthenticated, async (req, res) => {
    db.query('SELECT * FROM subjects', (err, results) => {
        if (err) throw err;
        res.render('subjects', {
            user: req.session.user,
            subjects: results
        });
    });
});

//hariz edit 
app.get('/subjects/edit/:id', checkAuthenticated, async (req, res) => {
    const subjectId = req.params.id;

    db.query('SELECT * FROM subjects WHERE id = ?', [subjectId], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.status(404).send('Subject not found');
        }

        res.render('subjects_edit', {
            user: req.session.user,
            subject: results[0]
        });
    });
});

//hariz edit the thing
app.post('/subjects/edit/:id', checkAuthenticated, (req, res) => {
    const subjectId = req.params.id;
    const { name, code, description } = req.body;

    const sql = 'UPDATE subjects SET name = ?, code = ?, description = ? WHERE id = ?';
    db.query(sql, [name, code, description, subjectId], (err) => {
        if (err) throw err;
        res.redirect('/subjects');
    });
});

//hariz add
app.post('/subjects/add', checkAuthenticated, (req, res) => {
    const { name, code, description } = req.body;

    const sql = 'INSERT INTO subjects (name, code, description, created_at) VALUES (?, ?, ?, NOW())';

    db.query(sql, [name, code, description], (err, result) => {
        if (err) {
            console.error('Error inserting subject:', err);
            return res.status(500).send('Error adding subject.');
        }
        res.redirect('/subjects');
    });
});

//hariz search
app.get('/subjects/search', checkAuthenticated, (req, res) => {
    const { name = '', code = '' } = req.query;

    const sql = `
        SELECT * FROM subjects
        WHERE name LIKE ? AND code LIKE ?
    `;

    const searchName = `%${name}%`;
    const searchCode = `%${code}%`;

    db.query(sql, [searchName, searchCode], (err, results) => {
        if (err) {
            console.error('Search error:', err);
            return res.status(500).send('Search failed.');
        }

        res.render('subjects', {
            user: req.session.user,
            subjects: results
        });
    });
});

//hariz views
app.get('/subjects/view/:id', checkAuthenticated, (req, res) => {
    const subjectId = req.params.id;

    db.query('SELECT * FROM subjects WHERE id = ?', [subjectId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            return res.status(404).send('Subject not found');
        }

        res.render('subjects_view', {
            user: req.session.user,
            subject: results[0]
        });
    });
});

//hariz delete
app.get('/subjects_delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;

    // Delete related exams
    db.query('DELETE FROM exams WHERE subject_id = ?', [id], (err) => {
        if (err) {
            console.error('Error deleting related exams:', err.message);
            return res.status(500).send('Error deleting related exams');
        }

        // Delete related timetable entries
        db.query('DELETE FROM timetable WHERE subject_id = ?', [id], (err) => {
            if (err) {
                console.error('Error deleting related timetable entries:', err.message);
                return res.status(500).send('Error deleting related timetable entries');
            }

            // Delete related study groups
            db.query('DELETE FROM study_groups WHERE subject_id = ?', [id], (err) => {
                if (err) {
                    console.error('Error deleting related study groups:', err.message);
                    return res.status(500).send('Error deleting related study groups');
                }

                // Delete related resources
                db.query('DELETE FROM resources WHERE subject_id = ?', [id], (err) => {
                    if (err) {
                        console.error('Error deleting related resources:', err.message);
                        return res.status(500).send('Error deleting related resources');
                    }

                    // Finally delete the subject
                    db.query('DELETE FROM subjects WHERE id = ?', [id], (err) => {
                        if (err) {
                            console.error('Database delete error:', err.message);
                            return res.status(500).send('Error deleting subject');
                        }

                        // Reset AUTO_INCREMENT based on the current max ID
                        db.query('SELECT MAX(id) AS maxId FROM subjects', (err, results) => {
                            if (err) {
                                console.error('Error retrieving max ID:', err.message);
                                return res.status(500).send('Error resetting AUTO_INCREMENT');
                            }

                            const nextId = (results[0].maxId || 0) + 1;
                            db.query('ALTER TABLE subjects AUTO_INCREMENT = ?', [nextId], (err) => {
                                if (err) {
                                    console.error('Error resetting AUTO_INCREMENT:', err.message);
                                    return res.status(500).send('Failed to reset AUTO_INCREMENT');
                                }

                                res.redirect('/subjects');
                            });
                        });
                    });
                });
            });
        });
    });
});

// Add this route for the GET request to show the add subject page
app.get('/subjects/add', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('subjects_add', { user: req.session.user });
});

//hsuan timetable
// View all Timetable Entries (and handle search results)
app.get('/timetable', checkAuthenticated, (req, res) => {
    const { subject, day } = req.query; // Get search parameters from query string
    let displayEntries = timetableEntries; // Start with all entries

    // Apply filters if search parameters are present
    if (subject) {
        displayEntries = displayEntries.filter(entry =>
            entry.subject.toLowerCase().includes(subject.toLowerCase())
        );
    }
    if (day) {
        displayEntries = displayEntries.filter(entry =>
            entry.day.toLowerCase().includes(day.toLowerCase())
        );
    }

    res.render('timetable', {
        title: 'Study Timetable',
        user: req.session.user,
        entries: displayEntries, // Pass filtered entries
        searchSubject: subject || '', // Pass search term back to form
        searchDay: day || '',       // Pass search term back to form
        messages: req.flash('success'), // Pass success messages
        errors: req.flash('error')    // Pass error messages
    });
});

let timetableEntries = [
    { id: 1, subject: 'Software Development Process', day: 'Monday', time_slot: '10:00 - 12:00' },
    { id: 2, subject: 'Business Intelligence', day: 'Wednesday', time_slot: '14:00 - 16:00' },
    { id: 3, subject: 'Software Application Development', day: 'Friday', time_slot: '09:00 - 11:00' },
];
let nextId = 4; // To assign unique IDs

// Add new Timetable Entry (GET for form)
app.get('/timetable/add', checkAuthenticated, (req, res) => {
    res.render('add_timetable', {
        title: 'Add New Entry',
        user: req.session.user,
        messages: req.flash('error') // For any form validation errors
    });
});

// Add new Timetable Entry (POST for submission)
app.post('/timetable/add', checkAuthenticated, (req, res) => {
    const { subject, day, time_slot } = req.body;

    if (!subject || !day || !time_slot) {
        req.flash('error', 'All fields are required to add a timetable entry.');
        return res.redirect('/timetable/add');
    }

    const newEntry = {
        id: nextId++,
        subject,
        day,
        time_slot
    };
    timetableEntries.push(newEntry);
    req.flash('success', 'Timetable entry added successfully!');
    res.redirect('/timetable');
});

// Edit Timetable Entry (GET for form)
app.get('/timetable/edit/:id', checkAuthenticated, (req, res) => {
    const entry = timetableEntries.find(e => e.id == req.params.id);
    if (!entry) {
        req.flash('error', 'Timetable entry not found.');
        return res.redirect('/timetable');
    }
    res.render('edit_timetable', {
        title: 'Edit Entry',
        user: req.session.user,
        entry,
        messages: req.flash('error') // For any form validation errors
    });
});

// Edit Timetable Entry (POST for submission)
app.post('/timetable/edit/:id', checkAuthenticated, (req, res) => {
    const entryIndex = timetableEntries.findIndex(e => e.id == req.params.id);
    if (entryIndex === -1) {
        req.flash('error', 'Timetable entry not found for editing.');
        return res.redirect('/timetable');
    }

    const { subject, day, time_slot } = req.body;

    if (!subject || !day || !time_slot) {
        req.flash('error', 'All fields are required to update a timetable entry.');
        return res.redirect(`/timetable/edit/${req.params.id}`);
    }

    timetableEntries[entryIndex] = {
        id: parseInt(req.params.id), // Ensure ID remains the same
        subject,
        day,
        time_slot
    };
    req.flash('success', 'Timetable entry updated successfully!');
    res.redirect('/timetable');
});

// Delete Timetable Entry
app.get('/timetable/delete/:id', checkAuthenticated, (req, res) => {
    const entryIndex = timetableEntries.findIndex(e => e.id == req.params.id);
    if (entryIndex === -1) {
        req.flash('error', 'Timetable entry not found.');
        return res.redirect('/timetable');
    }
    
    timetableEntries.splice(entryIndex, 1);
    req.flash('success', 'Timetable entry deleted successfully!');
    res.redirect('/timetable');
});

// RESOURCES ROUTE (shem)
// resources link (GET)
app.get('/resources', checkAuthenticated, (req, res) => {
    const sql = 'SELECT * FROM resources ORDER BY created_at DESC;';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('DB error (list):', err);
            return res.status(500).send('Database error');
        }
        res.render('resources', { nameQuery: '', subjectQuery: '', user: req.session.user, resources: results});
    });
});

// search resources (GET)
app.get('/searchResource', checkAuthenticated, (req, res) => {
    const { name = '', subject = '' } = req.query;
    const nameSearch = `%${name}%`;
    const subjectSearch = `%${subject}%`;

    const sql = `
        SELECT * FROM resources
        WHERE title LIKE ? AND subject_id LIKE ?
        ORDER BY created_at DESC
    `;

    db.query(sql, [nameSearch, subjectSearch], (err, results) => {
        if (err) {
            console.error('DB error (search):', err);
            return res.status(500).send('Database error');
        }
        res.render('resources', {
            nameQuery: name,
            subjectQuery: subject,
            user: req.session.user,
            resources: results
        });
    });
});

// view resource (GET)
app.get('/viewResource/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM resources WHERE id = ?';

    db.query(sql, [id], (err, rows) => {
        if (err) {
            console.error('DB error (detail):', err);
            return res.status(500).send('Database error');
        }
        if (!rows.length) return res.status(404).send('Resource not found');

        res.render('viewResource', {selected: rows[0], user: req.session.user});
    });
});

// edit resource (GET)
app.get('/editResource/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM resources WHERE id = ?';

    db.query(sql, [id], (err, rows) => {
        if (err) {
            console.error('DB error (edit GET):', err);
            return res.status(500).send('Database error');
        }
        if (!rows.length) return res.status(404).send('Resource not found');

        res.render('editResource', {selected: rows[0],user: req.session.user
});
    });
});

// add resource (POST)
app.post('/addResource', checkAuthenticated, (req, res) => {
    const { subject_id, title, type, url } = req.body;
    const sql = `
    INSERT INTO resources (subject_id, title, type, url, created_at)
    VALUES (?, ?, ?, ?, NOW())
  `;

    db.query(sql, [subject_id, title, type, url], (err) => {
        if (err) {
            console.error('Insert error:', err);
            return res.status(500).send('Error adding resource.');
        }
        res.redirect('/resources');
    });
});

// edit resource (POST)
app.post('/editResource/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    const { subject_id, title, type, url } = req.body;

    const sql = `
    UPDATE resources
    SET subject_id = ?, title = ?, type = ?, url = ?
    WHERE id = ?
  `;
    db.query(sql, [subject_id, title, type, url, id], (err) => {
        if (err) {
            console.error('Update error:', err);
            return res.status(500).send('Error updating resource.');
        }
        res.redirect('/resources');
    });
});

// delete resource (POST)
app.post('/deleteResource/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM resources WHERE id = ?';
    db.query(sql, [id], (err) => {
        if (err) {
            console.error('Delete error:', err);
            return res.status(500).send('Error deleting resource.');
        }
        res.redirect('/resources');
    });
});

// /study_groups route to display study groups
app.get('/study_groups', checkAuthenticated, (req, res) => {
    const search = req.query.search || ''; // Capture the search query if provided

    // SQL query to filter study groups by name or subject_id
    const sql = `
        SELECT * FROM study_groups
        WHERE name LIKE ? OR subject_id LIKE ?
    `;
    
    db.query(sql, [`%${search}%`, `%${search}%`], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error Retrieving study_groups');
        }
        
        // Render the view with the results and search query passed in
        res.render('study_groups', {
            user: req.session.user,
            study_groups: results,
            search: search,        // Pass search to the view
            nameQuery: search      // You can use nameQuery for the form input
        });
    });
});



//justin search 
app.get('/searchStudyGroups', checkAuthenticated, (req, res) => {
    const { name = '', subject = '' } = req.query;
    const nameSearch = `%${name}%`;
    const subjectSearch = `%${subject}%`;

    const sql = `
        SELECT * FROM study_groups
        WHERE name LIKE ? AND subject_id LIKE ?
        ORDER BY created_at DESC
    `;

    db.query(sql, [nameSearch, subjectSearch], (err, results) => {
        if (err) {
            console.error('DB error (search study groups):', err);
            return res.status(500).send('Database error');
        }

        // Render the study_groups page with search results
        res.render('study_groups', {
            nameQuery: name,        // Pass the search term for the input
            subjectQuery: subject,  // Optional, for subject filtering
            user: req.session.user,
            study_groups: results
        });
    });
});


//Justin details
app.get('/study_groups_details/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM study_groups WHERE id = ?';
    
    db.query(sql, [id], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error Retrieving study_groups by ID');
        }
        if (results.length > 0) {
            res.render('study_groups_details', { study_groups: results[0]});
        } 
        else
        {
            res.status(404).send('groups not found');
        }
    });
});

//Justin get edit 
app.get('/study_groups_edit/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM study_groups WHERE id = ?';
    
    db.query(sql, [id], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error Retrieving study_groups by ID');
        }
        if (results.length > 0) {
            res.render('study_groups_edit', { study_groups: results[0]});
        } 
        else
        {
            res.status(404).send('groups not found');
        }
    });
});

//Justin post edit
app.post('/study_groups_edit/:id', (req, res) => {
    const id = req.params.id;
    const { name, subject_id, members } = req.body;

    const sql = 'UPDATE study_groups SET name = ?, subject_id = ?, members = ? WHERE id = ?';
    db.query(sql, [name, subject_id, members, id], (error, result) => {
        if (error) {
            console.error('Database update error:', error.message);
            return res.status(500).send('Error updating study group');
        }
        res.redirect('/study_groups');
    });
});

//Justin delete
app.get('/study_groups_delete/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM study_groups WHERE id = ?';

    db.query(sql, [id], (error, result) => {
        if (error) {
            console.error('Database delete error:', error.message);
            return res.status(500).send('Error deleting study group');
        }
        res.redirect('/study_groups');
    });
});

//Justin add get
app.get('/study_groups_add', checkAuthenticated, (req, res) => {
    res.render('study_groups_add'); // Assuming you have views/study_groups_add.ejs
});

//Justin add post
app.post('/study_groups_add', checkAuthenticated, (req, res) => {
    const { name, subject_id, members } = req.body;

    const sql = 'INSERT INTO study_groups (name, subject_id, members, created_at) VALUES (?, ?, ?, NOW())';

    db.query(sql, [name, subject_id, members], (err, result) => {
        if (err) {
            console.error('Error inserting study group:', err);
            return res.status(500).send('Error adding study group.');
        }
        res.redirect('/study_groups');
    });
});


//dini
app.get('/exams', checkAuthenticated, (req, res) => {
    const sql = `
        SELECT e.*, s.name as subject_name, s.code as subject_code 
        FROM exams e 
        LEFT JOIN subjects s ON e.subject_id = s.id 
        ORDER BY e.date ASC
    `;
    
    db.query(sql, (err, results) => {
        if (err) throw err;
        res.render('exams', {
            user: req.session.user,
            exams: results
        });
    });
});

//dini edit exam
app.get('/exams/edit/:id', checkAuthenticated, (req, res) => {
    const examId = req.params.id;

    const sql = `
        SELECT e.*, s.name as subject_name, s.code as subject_code 
        FROM exams e 
        LEFT JOIN subjects s ON e.subject_id = s.id 
        WHERE e.id = ?
    `;

    db.query(sql, [examId], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.status(404).send('Exam not found');
        }

        // Get all subjects for dropdown
        db.query('SELECT * FROM subjects', (err, subjects) => {
            if (err) throw err;
            
            res.render('exams_edit', {
                user: req.session.user,
                exam: results[0],
                subjects: subjects
            });
        });
    });
});

//dini edit the exam
app.post('/exams/edit/:id', checkAuthenticated, (req, res) => {
    const examId = req.params.id;
    const { subject_id, date, venue, time, duration, retake } = req.body;
    
    // Convert retake checkbox to boolean (1 if checked, 0 if not)
    const isRetake = retake === 'on' ? 1 : 0;
    
    // Handle empty values properly - convert empty strings to NULL for optional fields
    const cleanTime = time === '' ? null : time;
    const cleanDuration = duration === '' ? null : parseInt(duration) || null;

    const sql = 'UPDATE exams SET subject_id = ?, date = ?, venue = ?, time = ?, duration = ?, retake = ? WHERE id = ?';
    db.query(sql, [subject_id, date, venue, cleanTime, cleanDuration, isRetake, examId], (err) => {
        if (err) {
            console.error('Error updating exam:', err);
            return res.status(500).send('Error updating exam: ' + err.message);
        }
        res.redirect('/exams');
    });
});

//dini add exam
app.post('/exams/add', checkAuthenticated, (req, res) => {
    const { subject_id, date, venue, time, duration, retake } = req.body;
    
    // Convert retake checkbox to boolean (1 if checked, 0 if not)
    const isRetake = retake === 'on' ? 1 : 0;
    
    // Handle empty values properly - convert empty strings to NULL for optional fields
    const cleanTime = time === '' ? null : time;
    const cleanDuration = duration === '' ? null : parseInt(duration) || null;
    
    console.log('Received exam data:', { subject_id, date, venue, time: cleanTime, duration: cleanDuration, retake: isRetake });

    const sql = 'INSERT INTO exams (subject_id, date, venue, time, duration, retake, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())';

    db.query(sql, [subject_id, date, venue, cleanTime, cleanDuration, isRetake], (err, result) => {
        if (err) {
            console.error('Error inserting exam:', err);
            console.error('SQL:', sql);
            console.error('Values:', [subject_id, date, venue, cleanTime, cleanDuration, isRetake]);
            return res.status(500).send('Error adding exam: ' + err.message);
        }
        console.log('Exam added successfully:', result.insertId);
        res.redirect('/exams');
    });
});

//dini search exams
app.get('/exams/search', checkAuthenticated, (req, res) => {
    const { name = '', code = '' } = req.query;

    const sql = `
        SELECT e.*, s.name as subject_name, s.code as subject_code 
        FROM exams e 
        LEFT JOIN subjects s ON e.subject_id = s.id 
        WHERE s.name LIKE ? AND s.code LIKE ?
        ORDER BY e.date ASC
    `;

    const searchName = `%${name}%`;
    const searchCode = `%${code}%`;

    db.query(sql, [searchName, searchCode], (err, results) => {
        if (err) {
            console.error('Search error:', err);
            return res.status(500).send('Search failed.');
        }

        res.render('exams', {
            user: req.session.user,
            exams: results
        });
    });
});

//dini view exam
app.get('/exams/view/:id', checkAuthenticated, (req, res) => {
    const examId = req.params.id;

    const sql = `
        SELECT e.*, s.name as subject_name, s.code as subject_code, s.description as subject_description 
        FROM exams e 
        LEFT JOIN subjects s ON e.subject_id = s.id 
        WHERE e.id = ?
    `;

    db.query(sql, [examId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            return res.status(404).send('Exam not found');
        }

        res.render('exams_view', {
            user: req.session.user,
            exam: results[0]
        });
    });
});

//dini delete exam
app.get('/exams_delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;

    db.query('DELETE FROM exams WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Database delete error:', err.message);
            return res.status(500).send('Error deleting exam');
        }
        res.redirect('/exams');
    });
});

// POST route for exam deletion (from edit form)
app.post('/exams/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const id = req.params.id;

    db.query('DELETE FROM exams WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Database delete error:', err.message);
            return res.status(500).send('Error deleting exam');
        }
        res.redirect('/exams');
    });
});

//dini add exam page
app.get('/exams/add', checkAuthenticated, checkAdmin, (req, res) => {
    // Get all subjects for dropdown
    db.query('SELECT * FROM subjects', (err, subjects) => {
        if (err) throw err;
        
        res.render('exams_add', { 
            user: req.session.user,
            subjects: subjects
        });
    });
});

// Start server 
app.listen(3000, () => {
    console.log('Server started on port 3000');
});