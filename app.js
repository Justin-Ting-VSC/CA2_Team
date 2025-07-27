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

app.get('/dashboard', checkAuthenticated, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});

app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('admin', { user: req.session.user });
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

                        res.redirect('/subjects');
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
app.get('/timetable', checkAuthenticated, (req, res) => {
    res.render('timetable', { user: req.session.user });
});

//shem resources
app.get('/resources', checkAuthenticated, (req, res) => {
    res.render('resources', { user: req.session.user });
});

//justin study groups go to study_groups.ejs
app.get('/study_groups', checkAuthenticated, (req, res) => {

    //check all data inside study_groups
    const sql = 'SELECT * FROM study_groups';
    db.query(sql, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error Retrieving study_groups');
        }

        // collect data to insert
        res.render('study_groups', { user: req.session.user, study_groups: results });
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
    res.render('exams', { user: req.session.user });
});

// Start server 
app.listen(3000, () => {
    console.log('Server started on port 3000');
});