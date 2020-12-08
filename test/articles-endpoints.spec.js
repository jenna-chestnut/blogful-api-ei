const { expect } = require("chai");
const knex = require("knex");
const supertest = require("supertest");
const app = require("../src/app");
const { makeArticlesArray, makeMaliciousArticle } = require("./articles.fixtures");

describe("Article endpoints", () => {
  let db;

  before("make knex instance", () => {
    db = knex({
      client: "pg",
      connection: process.env.TEST_DB_URL
    });
    app.set("db", db);
  });

  before("clean the table", () => db("blogful_articles").truncate());

  after("disconnect from db", () => db.destroy());

  afterEach("cleanup", () => db("blogful_articles").truncate());

  describe("GET /api/articles", () => {
    context(`Given no articles`, () => {
      it(`responds with 200 and an empty list`, () => {
        return supertest(app).get("/api/articles").expect(200, []);
      });
    });

    context("Given there are articles in the database", () => {
      const testArticles = makeArticlesArray();

      beforeEach("insert articles", () => {
        return db.into("blogful_articles").insert(testArticles);
      });

      it("GET /api/articles responds with 200 and all articles", () => {
        return supertest(app).get("/api/articles").expect(200, testArticles);
      });
    });

    context(`Given an XSS attack article`, () => {
      const maliciousArticle = makeMaliciousArticle();
      
      beforeEach('insert malicious article', () => {
        return db
          .into('blogful_articles')
          .insert([ maliciousArticle ]);
      });
      
      it('removes XSS attack content', () => {
        return supertest(app)
          .get(`/api/articles`)
          .expect(200)
          .expect(res => {
            expect(res.body[0].title).to.eql('Naughty naughty very naughty &lt;script&gt;alert(\"xss\");&lt;/script&gt;');
            expect(res.body[0].content).to.eql(`Bad image <img src="https://url.to.file.which/does-not.exist">. But not <strong>all</strong> bad.`);
          });
      });
    });
  });

  describe("POST /api/articles", () => {
    it("creates an articles, responds with 201 and the new article", function() {
      this.retries(3);
      const newArticle = {
        title: "Test new article",
        style: "Listicle",
        content: "Test new article content..."
      };
      return supertest(app)
        .post("/api/articles")
        .send(newArticle)
        .expect(201)
        .expect((res) => {
          expect(res.body.title).to.eql(newArticle.title);
          expect(res.body.style).to.eql(newArticle.style);
          expect(res.body.content).to.eql(newArticle.content);
          expect(res.body).to.have.property("id");
          expect(res.headers.location).to.eql(`/api/articles/${res.body.id}`);
          const expected = new Date().toLocaleDateString();
          const actual = new Date(res.body.date_published).toLocaleDateString();
          expect(actual).to.eql(expected);
        })
        .then((postRes) =>
          supertest(app)
            .get(`/api/articles/${postRes.body.id}`)
            .expect(postRes.body)
        );
    });

    const fields = ['title', 'style', 'content'];
    fields.forEach(field => {
      const newArticle = {
        title: "Test new article",
        style: "Listicle",
        content: "Test new article content..."
      };
      it(`responds with 400 and an error message when ${field} field is missing`, () => {
        delete newArticle[field];
        return supertest(app)
          .post('/api/articles')
          .send(newArticle)
          .expect(400, {
            error: {message: `Missing ${field} in request body`}
          });
      });
    });

    context(`When an XSS attack article is put in, article is sanitized right away`, () => {
      const maliciousArticle = makeMaliciousArticle();
      
      it('removes XSS attack content', () => {
        return supertest(app)
          .post(`/api/articles`)
          .send(maliciousArticle)
          .expect(201)
          .expect(res => {
            expect(res.body.title).to.eql('Naughty naughty very naughty &lt;script&gt;alert(\"xss\");&lt;/script&gt;');
            expect(res.body.content).to.eql(`Bad image <img src="https://url.to.file.which/does-not.exist">. But not <strong>all</strong> bad.`);
          });
      });
    });
  });

  describe("GET /api/articles/:id", () => {
    context(`Given no articles`, () => {
      it(`responds with 404`, () => {
        const articleId = 123456;
        return supertest(app)
          .get(`/api/articles/${articleId}`)
          .expect(404, { error: { message: `Article doesn't exist` } });
      });
    });

    context("Given there are articles in the database", () => {
      const testArticles = makeArticlesArray();

      beforeEach("insert articles", () => {
        return db.into("blogful_articles").insert(testArticles);
      });

      it("GET /api/articles/:id responds with 200 and the specified article", () => {
        const articleId = 3;
        const expected = testArticles[articleId - 1];
        return supertest(app)
          .get(`/api/articles/${articleId}`)
          .expect(200, expected);
      });
    });

    context(`Given an XSS attack article`, () => {
      const maliciousArticle = makeMaliciousArticle();
      
      beforeEach('insert malicious article', () => {
        return db
          .into('blogful_articles')
          .insert([ maliciousArticle ]);
      });
      
      it('removes XSS attack content', () => {
        return supertest(app)
          .get(`/api/articles/${maliciousArticle.id}`)
          .expect(200)
          .expect(res => {
            expect(res.body.title).to.eql('Naughty naughty very naughty &lt;script&gt;alert(\"xss\");&lt;/script&gt;');
            expect(res.body.content).to.eql(`Bad image <img src="https://url.to.file.which/does-not.exist">. But not <strong>all</strong> bad.`);
          });
      });
    });
  });

  describe(`DELETE /api/articles/:article_id`, () => {
    context(`Given no articles`, () => {
      it(`responds with 404`, () => {
        const articleId = 123456;
        return supertest(app)
          .delete(`/api/articles/${articleId}`)
          .expect(404, { error: { message: `Article doesn't exist` } });
      });
    });

    context('Given there are articles in the database', () => {
      const testArticles = makeArticlesArray();
    
      beforeEach('insert articles', () => {
        return db
          .into('blogful_articles')
          .insert(testArticles);
      });
    
      it('responds with 204 and removes the article', () => {
        const idToRemove = 2;
        const expectedArticles = testArticles.filter(article => article.id !== idToRemove);
        return supertest(app)
          .delete(`/api/articles/${idToRemove}`)
          .expect(204)
          .then(res =>
            supertest(app)
              .get(`/api/articles`)
              .expect(expectedArticles)
          );
      });
    });
  });

  describe("PATCH /api/articles/:articleid", () => {
    context('Given no articles', () => {
      it('responds with 404 if article does not exist', () => {
        const articleId = 123456;
        return supertest(app)
          .patch(`/api/articles/${articleId}`)
          .send({
            title: "Test updated article",
            content: "Test updated article content..."
          })
          .expect(404, { 
            error: { 
              message: `Article doesn't exist` 
            } 
          });
      });
    });

    context('Given there are articles in the database', () => {
      const testArticles = makeArticlesArray();

      beforeEach("insert articles", () => {
        return db.into("blogful_articles").insert(testArticles);
      });

      it("updates an existing article, responds with 201 and the updated article", () => {
        const articleId = 2;
        const newArticleData = {
          title: "Test updated article",
          content: "Test updated article content..."
        };
        return supertest(app)
          .patch(`/api/articles/${articleId}`)
          .send(newArticleData)
          .expect(204)
          .then(() =>
            supertest(app)
              .get(`/api/articles/${articleId}`)
              .expect((res) => {
                expect(res.body.title).to.eql(newArticleData.title);
                expect(res.body.style).to.eql(testArticles[articleId - 1].style);
                expect(res.body.content).to.eql(newArticleData.content);
                expect(res.body.id).to.eql(articleId);
              })
          );
      });

      it("gives a 400 error if no required fields are inputted", () => {
        const articleId = 2;
        const newArticleData = {
          randomField: 'nothin',
        };
        return supertest(app)
          .patch(`/api/articles/${articleId}`)
          .send(newArticleData)
          .expect(400, {
            error: {
              message: `Please input at least one field for updating` 
            } 
          });
      });
    });
  });
});