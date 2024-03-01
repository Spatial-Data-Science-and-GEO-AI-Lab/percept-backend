const express = require('express');
const { body, validationResult } = require('express-validator');
const cors = require('cors');
const { Pool } = require('pg')
const Router = require('express-promise-router')
const { dbname, dbhost, testdbname, testdbhost } = require('./config.js');
const DOMPurify = require('isomorphic-dompurify');

const app = express();
app.set('trust proxy', 'loopback');

let pool;
if (process.env.NODE_ENV === 'test') {
  pool = new Pool({database: testdbname, host: testdbhost});
} else {
  pool = new Pool({database: dbname, host: dbhost});
}

const router = new Router()

const clean = DOMPurify.sanitize;

function debuglog(str) {
  console.log(str);
}

const s = JSON.stringify;

app.use(cors());
app.use(express.json());

async function create_new_person({age, monthly_gross_income, education, gender, country, postcode, consent}) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // insert survey entry
    const qtxt1 = 'INSERT INTO survey (age, monthly_gross_income, education, gender, country, postalcode, consent) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING survey_id';
    const { rows: [{ survey_id }] } = await c.query(qtxt1, [age, monthly_gross_income, education, gender, country, postcode, consent]);

    // insert person entry
    const { rows: [{ person_id }] } = await c.query('INSERT INTO person (survey_id) VALUES ($1) RETURNING person_id', [survey_id]);

    await c.query('COMMIT');
    return person_id;
  } catch (e) {
    await c.query('ROLLBACK');
    debuglog(`ERROR ${e}`);
    throw e;
  } finally {
    c.release();
  }
}

async function create_or_retrieve_session(person_id) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    const { rows } = await c.query('SELECT session_id FROM session WHERE person_id = $1 ORDER BY session_active DESC LIMIT 1', [person_id]);
    if (rows.length === 1) {
      const [ {session_id} ] = rows;
      await c.query('COMMIT');
      return session_id;
    }

    const { rows: [{session_id}] } = await c.query('INSERT INTO session (person_id) VALUES ($1) RETURNING session_id', [person_id]);

    await c.query('COMMIT');
    return session_id;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

async function get_cookie_hash(req, person_id) {
  const c = await pool.connect();
  const ip = req.ip;
  const ua = req.get('User-Agent') || '';
  try {
    const { rows } = await c.query("SELECT encode(cookie_hash, 'base64') FROM cookie WHERE person_id=$1 AND (expiration IS NULL OR expiration > now())", [person_id]);
    if (rows.length > 0) return rows[0]['cookie_hash'];

    await c.query('BEGIN');

    await c.query('INSERT INTO useragent (useragent_id, useragent_str) VALUES (md5($1)::uuid,$2) ON CONFLICT DO NOTHING', [ua, ua]);
    const { rows: [{cookie_hash}] } = await c.query("INSERT INTO cookie (cookie_hash, person_id, useragent_id, ipaddr) VALUES (sha224(($1||'_'||now())::bytea),$2, md5($3)::uuid, $4) RETURNING encode(cookie_hash,'base64') AS cookie_hash", [person_id, person_id, ua, ip]);

    await c.query('COMMIT');
    return cookie_hash;
  } catch (e) {
    await c.query('ROLLBACK');
    console.log(e);
    throw e;
  } finally {
    c.release();
  }
}

async function get_person_from_session(session_id, cookie_hash=null) {
  while(session_id) {
    const { rows } = await pool.query('SELECT person_id FROM session WHERE session_id=$1',[session_id]);
    if (rows.length === 0) break;
    const [ {person_id} ] = rows;
    debuglog(`get_person_from_session(${session_id},${cookie_hash}) => ${person_id}`);
    return person_id;
  }

  if(cookie_hash) {
    const { rows } = await pool.query("SELECT person_id FROM cookie WHERE cookie_hash=decode($1,'base64')",[cookie_hash]);
    if (rows.length === 0) return null;
    const [ {person_id} ] = rows;
    debuglog(`get_person_from_session(${session_id},${cookie_hash}) => ${person_id}`);
    return person_id;
  }

  debuglog(`get_person_from_session(${session_id},${cookie_hash}) => null`);
  return null;
}

async function check_cookie_hash({session_id, cookie_hash}) {
  //debuglog(`check_cookie_hash(${session_id},${cookie_hash})`);
  const { rows } = await pool.query("SELECT person_id FROM session JOIN cookie USING (person_id) WHERE session_id = $1 AND cookie_hash = decode($2,'base64')", [session_id, cookie_hash]);
  return (rows.length !== 0);
}

async function create_new_rating(req, {session_id, image_id, category_id, rating}) {
  const c = await pool.connect();
  const ip = req.ip;
  const ua = req.get('User-Agent') || '';
  try {
    await c.query('BEGIN');
    await c.query('INSERT INTO useragent (useragent_id, useragent_str) VALUES (md5($1)::uuid,$2) ON CONFLICT DO NOTHING', [ua, ua]);
    const qtxt = 'INSERT INTO rating (session_id, image_id, category_id, rating, useragent_id, ipaddr) VALUES ($1, $2, $3, $4, md5($5)::uuid, $6) RETURNING rating_id, ts';
    const { rows: [{ rating_id, ts }] } = await c.query(qtxt, [session_id, image_id, category_id, rating, ua, ip]);
    await c.query('INSERT into undoable (session_id, rating_id) VALUES ($1, $2) ON CONFLICT (session_id) DO UPDATE SET rating_id=$3 WHERE undoable.session_id=$4', [session_id, rating_id, rating_id, session_id]);
    await c.query('COMMIT');
    debuglog(`create_new_rating(${ip}, ${ua}, ${session_id}, ${image_id}, ${category_id}, ${rating}) => {rating_id: ${rating_id}, ts: ${ts}}`);
    return ts;
  } catch (e) {
    await c.query('ROLLBACK');
    debuglog(`ERROR ${e}`);
    throw e;
  } finally {
    c.release();
  }
  return null;
}

async function count_ratings_by_category({session_id}) {
  const res = await pool.query('SELECT category_id, count(*) FROM rating WHERE session_id = $1 GROUP BY category_id', [session_id]);
  let counts = {};
  for (const { category_id, count } of res.rows) {
    counts[parseInt(category_id)] = parseInt(count);
  }
  return { category_counts: counts };
}

async function count_ratings({session_id}) {
  const res = await pool.query('SELECT count(*) FROM rating WHERE session_id = $1', [session_id]);
  if (res.rows.length === 0)
    return 0;
  const [ {count} ] = res.rows;
  return parseInt(count);
}

async function undo_last_rating({session_id}) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    const res1 = await c.query('SELECT rating_id, rating.ts AS ts FROM undoable JOIN rating USING (rating_id, session_id) WHERE session_id = $1', [session_id]);
    if (res1.rows.length === 0) {
      await c.query('ROLLBACK');
      return null;
    }
    const [ {rating_id, ts} ] = res1.rows;

    await c.query('DELETE FROM undoable WHERE session_id = $1', [session_id]);
    await c.query('DELETE FROM rating WHERE session_id = $1 AND rating_id = $2', [session_id, rating_id]);
    await c.query('COMMIT');
    debuglog(`undo_last_rating(${session_id})`);
    return ts;
  } catch (e) {
    await c.query('ROLLBACK');
    debuglog(`ERROR ${e}`);
    throw e;
  } finally {
    c.release();
  }
  return null;
}

router.post('/new',
  body('session_id').isNumeric({no_symbols: true}).withMessage('Session ID must be a number'),
  body('image_id').isNumeric({no_symbols: true}).withMessage('Image ID must be a number'),
  body('category_id').isNumeric({no_symbols: true}).withMessage('Category ID must be a number'),
  body('rating').isInt({min: 1, max: 5}).withMessage('Rating must be a number from 1 to 5'),
  body('cookie_hash').isLength(40).withMessage('invalid length for cookie_hash'),
async (req, res) => {
  const errors = validationResult(req);
  let ts;
  if (!errors.isEmpty()) {
    debuglog(`new(${s(req.body)}) => { errors: ${s(errors.array())} }`);
    return res.status(400).json({ errors: errors.array().map((e) => e.msg) });
  }
  req.body.cookie_hash = req.body.cookie_hash ? clean(req.body.cookie_hash) : null;
  if (!await check_cookie_hash(req.body))
    return res.status(400).json({ errors: ['invalid authentication or session_id not present'] });

  try {
    ts = await create_new_rating(req, req.body);
  } catch(e) {
    debuglog(`new(${s(req.body)}) => { errors: [${s(e)}] }`);
    return res.status(400).json({ errors: [e.detail] });
  }

  if (ts)
    res.json({status: 'ok', timestamp: ts, session_rating_count: await count_ratings(req.body),
              ...await count_ratings_by_category(req.body)});
  else
    res.status(400).json({ errors: ['new rating creation failed'] });
});

router.post('/undo',
  body('session_id').isNumeric({no_symbols: true}).withMessage('Session ID must be a number'),
  body('cookie_hash').isLength(40).withMessage('invalid length for cookie_hash'),
async (req, res) => {
  const errors = validationResult(req);
  let ts;
  if (!errors.isEmpty()) {
    debuglog(`undo(${s(req.body)}) => { errors: ${s(errors.array())} }`);
    return res.status(400).json({ errors: errors.array().map((e) => e.msg) });
  }
  req.body.cookie_hash = req.body.cookie_hash ? clean(req.body.cookie_hash) : null;
  if (!await check_cookie_hash(req.body))
    return res.status(400).json({ errors: ['invalid authentication or session_id not present'] });

  try {
    ts = await undo_last_rating(req.body);
  } catch(e) {
    debuglog(`undo(${s(req.body)}) => { errors: [${s(e)}] }`);
    return res.status(400).json({ errors: [e.detail] });
  }

  if (ts)
    res.json({status: 'ok', timestamp: ts, ...await count_ratings_by_category(req.body)});
  else
    res.status(400).json({ errors: ['undo failed'] });
});

router.all('/fetch',
  body('session_id').isNumeric({no_symbols: true}).withMessage('Session ID must be a number'),
async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    debuglog(`fetch(${s(req.body)}) => { errors: ${s(errors.array())} }`);
    return res.status(400).json({ errors: errors.array().map((e) => e.msg) });
  }
  const { rows } = await pool.query('SELECT cityname,url,image_id FROM image WHERE enabled IS true AND image_id NOT IN (SELECT image_id FROM rating WHERE session_id = $1) ORDER BY random() LIMIT 1', [req.body.session_id]);
  return res.json({ main_image: rows[0] });
});

async function get_category_averages({session_id}) {
  const { rows } = await pool.query('SELECT category_id, avg(rating) AS average FROM rating WHERE session_id = $1 GROUP BY category_id', [session_id]);
  let avgs = {};
  if (rows.length > 0) {
    for (const {category_id, average} of rows) {
      avgs[category_id] = average;
    }
  }
  return avgs;
}

async function get_minmax_images({session_id}) {
  const qMin = `SELECT * FROM (SELECT url, rating, category_id, ROW_NUMBER () OVER (PARTITION BY category_id ORDER BY rating) rn FROM rating JOIN image USING (image_id) WHERE session_id = $1) q WHERE rn = 1`;
  const qMax = `SELECT * FROM (SELECT url, rating, category_id, ROW_NUMBER () OVER (PARTITION BY category_id ORDER BY rating DESC) rn FROM rating JOIN image USING (image_id) WHERE session_id = $1) q WHERE rn = 1`;

  const { rows: rowsMin } = await pool.query(qMin, [session_id]);
  let minImages = [];
  for (const {url, rating, category_id} of rowsMin)
    minImages.push({url, rating, category_id});

  const { rows: rowsMax } = await pool.query(qMax, [session_id]);
  let maxImages = [];
  for (const {url, rating, category_id} of rowsMax)
    maxImages.push({url, rating, category_id});

  return { minImages, maxImages };
}

router.all('/getstats',
  body('session_id').isNumeric({no_symbols: true}).withMessage('Session ID must be a number'),
async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    debuglog(`getstats(${s(req.body)}) => { errors: ${s(errors.array())} }`);
    return res.status(400).json({ errors: errors.array().map((e) => e.msg) });
  }
  const avgs = await get_category_averages(req.body);
  const json = { averages: avgs, ...await get_minmax_images(req.body) }
  //debuglog(`getstats(${s(req.body)}) => ${s(json)}`);
  return res.json(json);
});

router.all('/getcategories',
  body('langabbr').optional({ checkFalsy: true }).isNumeric({no_symbols: true}).withMessage('langabbr must be a 2-letter language abbreviation'),
async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const langabbr = req.body.langabbr ?? 'en';
  const { rows } = await pool.query('SELECT t1.v AS shortname, t2.v AS description, category_id FROM category JOIN translation t1 ON (shortname_sid = t1.string_id AND t1.langabbr = $1) JOIN translation t2 ON (description_sid = t2.string_id AND t2.langabbr = $2) ORDER BY category_id', [langabbr, langabbr]);
  res.json({ categories: rows });
});

router.all('/countratingsbycategory',
  body('session_id').isNumeric({no_symbols: true}).withMessage('Session ID must be a number'),
async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    debuglog(`fetch(${s(req.body)}) => { errors: ${s(errors.array())} }`);
    return res.status(400).json({ errors: errors.array().map((e) => e.msg) });
  }
  res.json(await count_ratings_by_category(req.body));
});

router.post(
  '/newperson',
  body('age').isNumeric({no_symbols: true}).withMessage('Age must be a number'),
  body('monthly_gross_income').optional({ checkFalsy: true }).isNumeric({no_symbols: true}).withMessage('Monthly gross income must be a number'),
  body('consent').isBoolean(),
async (req, res) => {
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const args = {
    age: req.body.age,
    monthly_gross_income: clean(req.body.monthly_gross_income || ''),
    education: clean(req.body.education || ''),
    gender: clean(req.body.gender || ''),
    country: clean(req.body.country || ''),
    postcode: clean(req.body.postcode || ''),
    consent: req.body.consent
  };

  const person_id = await create_new_person(args);
  const session_id = await create_or_retrieve_session(person_id);
  const cookie_hash = await get_cookie_hash(req, person_id);
  const ret = {
    session_id: session_id,
    cookie_hash: cookie_hash,
    cookie_hash_urlencoded: encodeURIComponent(cookie_hash)
  };
  debuglog(`newperson(${s(args)}) => ${s(ret)} (${s({person_id: person_id})})`);
  res.json(ret);
});

router.post('/getsession',
  body('session_id').optional({ checkFalsy: true }).isNumeric({no_symbols: true}).withMessage('session_id must be a number'),
  body('cookie_hash').optional({ checkFalsy: true }).isLength(40).withMessage('invalid length for cookie_hash'),
async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const cookie_hash = req.body.cookie_hash ? clean(req.body.cookie_hash) : null;
  let session_id = req.body.session_id;
  const person_id = await get_person_from_session(session_id, cookie_hash);
  if (person_id && !session_id) session_id = await create_or_retrieve_session(person_id);
  const ret = {
    cookie_hash: cookie_hash,
    session_id: session_id
  };
  const ip = req.ip;
  const ua = req.get('User-Agent');
  debuglog(`getsession(${ip},${ua},${s({session_id: session_id, cookie_hash: cookie_hash})}) => ${s(ret)}`);
  res.json(ret);
});

app.use('/api/v1',router);

const port = 8000;

if (process.env.NODE_ENV !== 'test') {
  module.exports = app.listen(port, () => {
    console.log(`Server is running on port ${port}.`);
  });
} else {
  module.exports = { app, pool };
}
