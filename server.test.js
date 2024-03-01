const app = require('./server.js');
const supertest = require('supertest');
const http = require('http');
const server = http.createServer(app.app);
let request = supertest(server);
const { testdbname, testdbhost } = require('./config.js');
const { Pool } = require('pg')
const fs = require('fs');
const { globSync, Glob } = require('glob');


beforeEach(
  async() => {
    //app.pool = new Pool({database: testdbname, host: testdbhost});
    const upfiles = new globSync('migrations/**/up.sql').sort();
    for (const file of upfiles) {
      //console.log(`loading ${file} from ${upfiles}`);
      const sql = fs.readFileSync(file).toString();
      await app.pool.query(sql);
    }
    const seedfiles = new globSync('seeds/{test,all}/*.sql').sort();
    for (const file of seedfiles) {
      const sql = fs.readFileSync(file).toString();
      await app.pool.query(sql);
    }
  }
);

afterEach(
  async() => {
    //await app.pool.end();
    const downfiles = new globSync('migrations/**/down.sql').sort().reverse();
    for (const file of downfiles) {
      //console.log(`loading ${file}`);
      const sql = fs.readFileSync(file).toString();
      await app.pool.query(sql);
    }
  }
);

describe('Fetch data', () => {
  const req1 = {
    session_id: 0
  };
  it('POST /api/v1/fetch', async () => {
    const res = await request.post('/api/v1/fetch').send(req1);
    expect(res.status).toEqual(200);
    expect(res.body.main_image.url).toMatch(/jpg/);
  });

  it('GET /api/v1/getcategories', async () => {
    const res = await request.get('/api/v1/getcategories');
    expect(res.status).toEqual(200);
    expect(res.body.categories.length).toBeGreaterThan(1);
    expect(res.body.categories[0].shortname.length).toBeGreaterThan(1);
    expect(res.body.categories[0].description.length).toBeGreaterThan(1);
  });
  it('POST /api/v1/getstats', async () => {
    const res = await request.post('/api/v1/getstats').send(req1);
    expect(res.status).toEqual(200);
    expect(Object.entries(res.body.averages).length).toEqual(0);
    expect(res.body.minImages.length).toEqual(0);
    expect(res.body.maxImages.length).toEqual(0);
  });
  it('POST /api/v1/countratingsbycategory', async () => {
    const res = await request.post('/api/v1/countratingsbycategory').send(req1);
    expect(res.status).toEqual(200);
    expect(Object.entries(res.body.category_counts).length).toEqual(0);
  });
});

describe('New person', () => {
  const person1_survey = {
         age: '25',
         monthly_gross_income: '1500',
         education: 'Bachelors',
         gender: 'Woman',
         country: 'NL',
         postcode: '3000',
         consent: true
      };
  it('POST /api/v1/newperson - invalid age', async () => {
    const res = await request.post('/api/v1/newperson').send({...person1_survey, age: '25a' });
    expect(res.status).toEqual(400);
  });
  it('POST /api/v1/newperson - invalid consent', async () => {
    const res = await request.post('/api/v1/newperson').send({...person1_survey, consent: '' });
    expect(res.status).toEqual(400);
  });

  it('POST /api/v1/newperson', async () => {
    const res = await request.post('/api/v1/newperson').send(person1_survey);
    expect(res.status).toEqual(200);
    expect(res.body.session_id).toEqual(1);
    expect(res.body.cookie_hash).toHaveLength(40);
    const res2 = await request.post('/api/v1/getsession').send({
      cookie_hash: res.body.cookie_hash
    });
    expect(res2.status).toEqual(200);
    expect(res2.body.session_id).toEqual(1);
  });
});

describe('Rating', () => {
  const person1_survey = {
    age: '19',
    monthly_gross_income: '3000',
    education: 'In University',
    gender: 'Non-binary',
    country: 'NL',
    postcode: '3584 CS',
    consent: true
  };
  it('POST /api/v1/new', async () => {
    const res1 = await request.post('/api/v1/newperson').send(person1_survey);
    expect(res1.status).toEqual(200);
    expect(res1.body.session_id).toEqual(1);
    expect(res1.body.cookie_hash).toHaveLength(40);

    const res2 = await request.post('/api/v1/getcategories').send();
    expect(res2.status).toEqual(200);
    expect(res2.body.categories.length).toBeGreaterThan(1);

    const res3 = await request.post('/api/v1/fetch').send(res1.body);
    expect(res3.status).toEqual(200);
    expect(res3.body.main_image).toBeDefined();
    expect(res3.body.main_image.image_id).toBeDefined();

    const input = {
      category_id: res2.body.categories[0].category_id,
      image_id: res3.body.main_image.image_id,
      rating: 3,
      session_id: res1.body.session_id,
      cookie_hash: res1.body.cookie_hash
    };
    const res4 = await request.post('/api/v1/new').send(input);
    expect(res4.status).toEqual(200);
    expect(res4.body.session_rating_count).toEqual(1);
    expect(res4.body.category_counts[res2.body.categories[0].category_id]).toEqual(1);

    const res5 = await request.post('/api/v1/getstats').send(input);
    expect(res5.status).toEqual(200);
    expect(Object.entries(res5.body.averages).length).toEqual(1);
    expect(parseInt(res5.body.averages[res2.body.categories[0].category_id])).toEqual(input.rating);
    expect(res5.body.minImages.length).toEqual(1);
    expect(res5.body.maxImages.length).toEqual(1);

    const res6 = await request.post('/api/v1/countratingsbycategory').send(input);
    expect(res6.status).toEqual(200);
    expect(res6.body.category_counts[res2.body.categories[0].category_id]).toEqual(1);
  });
  it('POST /api/v1/new - malformed session', async () => {
    const input = {
      category_id: 1,
      image_id: 1,
      rating: 3,
      session_id: 'a',
      cookie_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    };
    const res = await request.post('/api/v1/new').send(input);
    expect(res.status).toEqual(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toMatch(/Session ID must be a number/);
  });
  it('POST /api/v1/new - invalid session', async () => {
    const input = {
      category_id: 1,
      image_id: 1,
      rating: 3,
      session_id: 2,
      cookie_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    };
    const res = await request.post('/api/v1/new').send(input);
    expect(res.status).toEqual(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toMatch(/session_id.*not present/);
  });
  it('POST /api/v1/new - invalid category', async () => {
    const res1 = await request.post('/api/v1/newperson').send(person1_survey);
    expect(res1.status).toEqual(200);
    expect(res1.body.session_id).toEqual(1);
    expect(res1.body.cookie_hash).toHaveLength(40);
    const input = {
      category_id: 1111,
      image_id: 1,
      rating: 3,
      session_id: 1,
      cookie_hash: res1.body.cookie_hash
    };
    const res = await request.post('/api/v1/new').send(input);
    expect(res.status).toEqual(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toMatch(/category_id.*not present/);
  });
  it('POST /api/v1/new - invalid image', async () => {
    const res1 = await request.post('/api/v1/newperson').send(person1_survey);
    expect(res1.status).toEqual(200);
    expect(res1.body.session_id).toEqual(1);
    expect(res1.body.cookie_hash).toHaveLength(40);
    const res2 = await request.post('/api/v1/getcategories').send();
    expect(res2.status).toEqual(200);
    expect(res2.body.categories.length).toBeGreaterThan(1);
    const input = {
      category_id: res2.body.categories[0].category_id,
      image_id: 111111111,
      rating: 3,
      session_id: 1,
      cookie_hash: res1.body.cookie_hash
    };
    const res = await request.post('/api/v1/new').send(input);
    expect(res.status).toEqual(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toMatch(/image_id.*not present/);
  });
  it('POST /api/v1/new - invalid rating', async () => {
    const res1 = await request.post('/api/v1/newperson').send(person1_survey);
    expect(res1.status).toEqual(200);
    expect(res1.body.session_id).toEqual(1);
    expect(res1.body.cookie_hash).toHaveLength(40);

    const res2 = await request.post('/api/v1/getcategories').send();
    expect(res2.status).toEqual(200);
    expect(res2.body.categories.length).toBeGreaterThan(1);

    const res3 = await request.post('/api/v1/fetch').send(res1.body);
    expect(res3.status).toEqual(200);
    expect(res3.body.main_image).toBeDefined();
    expect(res3.body.main_image.image_id).toBeDefined();

    const input = {
      category_id: res2.body.categories[0].category_id,
      image_id: res3.body.main_image.image_id,
      rating: 6,
      session_id: res1.body.session_id,
      cookie_hash: res1.body.cookie_hash
    };
    const res4 = await request.post('/api/v1/new').send(input);
    expect(res4.status).toEqual(400);
    expect(res4.body.errors).toHaveLength(1);
    expect(res4.body.errors[0]).toMatch(/Rating must be a number/);
  });

  it('POST /api/v1/undo', async () => {
    const res1 = await request.post('/api/v1/newperson').send(person1_survey);
    expect(res1.status).toEqual(200);
    expect(res1.body.session_id).toEqual(1);
    expect(res1.body.cookie_hash).toHaveLength(40);

    const res2 = await request.post('/api/v1/getcategories').send();
    expect(res2.status).toEqual(200);
    expect(res2.body.categories.length).toBeGreaterThan(1);

    const res3 = await request.post('/api/v1/fetch').send(res1.body);
    expect(res3.status).toEqual(200);
    expect(res3.body.main_image).toBeDefined();
    expect(res3.body.main_image.image_id).toBeDefined();

    const input = {
      category_id: res2.body.categories[0].category_id,
      image_id: res3.body.main_image.image_id,
      rating: 3,
      session_id: res1.body.session_id,
      cookie_hash: res1.body.cookie_hash
    };
    const res4 = await request.post('/api/v1/new').send(input);
    expect(res4.status).toEqual(200);
    const ts = res4.body.timestamp;

    const res5 = await request.post('/api/v1/undo').send(res1.body);
    expect(res5.status).toEqual(200);
    expect(res5.body.timestamp).toEqual(res4.body.timestamp);
  });

  it('POST /api/v1/undo - double undo', async () => {
    const res1 = await request.post('/api/v1/newperson').send(person1_survey);
    expect(res1.status).toEqual(200);
    expect(res1.body.session_id).toEqual(1);
    expect(res1.body.cookie_hash).toHaveLength(40);

    const res2 = await request.post('/api/v1/getcategories').send();
    expect(res2.status).toEqual(200);
    expect(res2.body.categories.length).toBeGreaterThan(1);

    const res3 = await request.post('/api/v1/fetch').send(res1.body);
    expect(res3.status).toEqual(200);
    expect(res3.body.main_image).toBeDefined();
    expect(res3.body.main_image.image_id).toBeDefined();

    const input = {
      category_id: res2.body.categories[0].category_id,
      image_id: res3.body.main_image.image_id,
      rating: 3,
      session_id: res1.body.session_id,
      cookie_hash: res1.body.cookie_hash
    };
    const res4 = await request.post('/api/v1/new').send(input);
    expect(res4.status).toEqual(200);
    const ts = res4.body.timestamp;

    const res5 = await request.post('/api/v1/undo').send(res1.body);
    expect(res5.status).toEqual(200);
    expect(res5.body.timestamp).toEqual(res4.body.timestamp);

    const res6 = await request.post('/api/v1/undo').send(res1.body);
    expect(res6.status).toEqual(400);
    expect(res6.body.errors[0]).toMatch(/undo failed/);
  });

  it('POST /api/v1/undo - undo before any rating', async () => {
    const res1 = await request.post('/api/v1/newperson').send(person1_survey);
    expect(res1.status).toEqual(200);
    expect(res1.body.session_id).toEqual(1);
    expect(res1.body.cookie_hash).toHaveLength(40);

    const res2 = await request.post('/api/v1/getcategories').send();
    expect(res2.status).toEqual(200);
    expect(res2.body.categories.length).toBeGreaterThan(1);

    const res3 = await request.post('/api/v1/fetch').send(res1.body);
    expect(res3.status).toEqual(200);
    expect(res3.body.main_image).toBeDefined();
    expect(res3.body.main_image.image_id).toBeDefined();

    const res5 = await request.post('/api/v1/undo').send(res1.body);
    expect(res5.status).toEqual(400);
    expect(res5.body.errors[0]).toMatch(/undo failed/);
  });

  it('POST /api/v1/undo - invalid session_id', async () => {
    const res = await request.post('/api/v1/undo').send({session_id: 1, cookie_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'});
    expect(res.status).toEqual(400);
    expect(res.body.errors[0]).toMatch(/session_id.*not present/);
  });
});
