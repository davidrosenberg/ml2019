'use strict';
const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');
const handlebarsFactory = require('handlebars');
const moment = require('moment');
const assert = require('assert');
const toSlug = require('slugg');

const SLIDES = 'Slides';
const NOTES = 'Notes';
const REFERENCES = 'References';

const TEMPLATES_DIR = path.resolve(__dirname, '../templates');

doTemplating(process.argv[2], process.argv[3]);

function doTemplating(input, output) {
    const handlebars = handlebarsFactory.create();
    registerHelpers(handlebars);
    registerPartials(handlebars);

    const template = compileTemplate(handlebars, input);
    const documents = parseDocuments();

    // Uncomment to see documents; useful while tweaking the templates
    // console.log(require("util").inspect(documents, { depth: Infinity }));

    fs.writeFileSync(output, template(documents));
}

function compileTemplate(handlebars, input) {
    return handlebars.compile(fs.readFileSync(input, { encoding: 'utf-8' }));
}

function parseDocuments() {
    const lectures = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../data/lectures.yml')));

    // Normalize the data
    for (const lecture of lectures) {
        for (const event of Object.values(lecture.Events)) {
            ensureArrayExists(event, SLIDES);
            ensureArrayExists(event, NOTES);
            ensureArrayExists(event, REFERENCES);
        }
    }

    let assignmentsFrontmatter, assignments;
    let i = 0;
    yaml.safeLoadAll(fs.readFileSync(path.resolve(__dirname, '../data/assignments.yml')), doc => {
        switch (i) {
            case 0:
                assignmentsFrontmatter = doc;
                break;
            case 1:
                assignments = doc;
                break;
            default:
                throw new Error('Cannot have more than two documents in assignments.yaml');
        }
        ++i;
    });

    for (const assignment of assignments) {
        if (!assignment.PDF && !assignment.ZIP) {
            assignment.noFiles = true;
        }
    }

    let thisWeek = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../data/this-week.yml')));

    if (thisWeek === null) {
        thisWeek = { lecture: null };
    } else {
        // Pull data from lectures and assignments into thisWeek:
        const thisWeekLecture = lectures.find(l => l.Title === thisWeek['Lecture/Lab']);
        const thisWeekAssignment = assignments.find(a => a.Label === thisWeek.Assignment);

        if (thisWeekLecture === undefined) {
            throw new Error(`Could not find entry in lectures.yml with Title "${thisWeek['Lecture/Lab']}" specified in ` +
                `this-week.yaml`);
        }
        if (thisWeekAssignment === undefined) {
            throw new Error(`Could not find entry in assignments.yml with Label "${thisWeek['Assignment']}" specified in ` +
                `this-week.yaml`);
        }

        thisWeek.lecture = thisWeekLecture;
        thisWeek.assignment = thisWeekAssignment;
    }

    return { lectures, thisWeek, assignmentsFrontmatter, assignments };
}

function registerPartials(handlebars) {
    for (const filename of fs.readdirSync(TEMPLATES_DIR)) {
        const filePath = path.resolve(TEMPLATES_DIR, filename);
        const partialName = path.basename(filename, '.hbs');
        const contents = fs.readFileSync(filePath, { encoding: 'utf-8' });

        handlebars.registerPartial(partialName, contents);
    }
}

function registerHelpers(handlebars) {
    handlebars.registerHelper('date', d => moment.utc(new Date(d).toISOString()).format('MMMM Do'));
    handlebars.registerHelper('shortDate', d => moment.utc(new Date(d).toISOString()).format('MMM D'));
    handlebars.registerHelper('maybeLink', v => {
        if (typeof v === 'string') {
            return v;
        }

        assert (typeof v === 'object' && v !== null, 'Links must be either strings or objects');

        const keys = Object.keys(v);
        assert(keys.length === 1, 'Link objects must have a single key');
        const key = keys[0];

        return new handlebars.SafeString('<a href="' + v[key] + '">' + key + '</a>');
    });
    handlebars.registerHelper('lectureSlug', l => 'lecture-' + toSlug(l.Title));
    handlebars.registerHelper('assignmentSlug', l => 'assignment-' + toSlug(l.Label));
}

function ensureArrayExists(obj, prop) {
    if (!(prop in obj)) {
        obj[prop] = [];
    }
}

function copyArrayInto(source, dest, keyName) {
    if (source && source[keyName]) {
        dest[keyName].push(...source[keyName]);
    }
}
