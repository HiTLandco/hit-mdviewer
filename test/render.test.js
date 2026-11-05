'use strict';
const assert = require('assert');
const { render } = require('../src/render');

let r = render('# سلام دنیا\n\nThis is English.\n\nفایل `config.json` را باز کن.');
assert.match(r.html, /<h1[^>]*dir="rtl"/, 'Persian heading is RTL');
assert.match(r.html, /<p dir="ltr">This is English/, 'English paragraph is LTR');
assert.match(r.html, /<p dir="rtl">فایل/, 'inline code does not flip a Persian line');

r = render('**Peyman** گفت که این فایل درست است');
assert.match(r.html, /<p dir="rtl">/, 'Persian line starting with an English word stays RTL');
assert.strictEqual(r.dir, 'rtl');

r = render('- یک\n- دو\n  - سه\n');
assert.strictEqual((r.html.match(/dir=/g) || []).length, 1, 'a list gets one direction');

r = render('| نام | سن |\n|---|---|\n| علی | ۲۰ |\n');
assert.match(r.html, /<table dir="rtl">/, 'table direction is set on the table');

r = render('سلام\n\nHello', { mode: 'ltr' });
assert.ok(!r.html.includes('dir='), 'forced mode sets no block direction');
assert.strictEqual(r.dir, 'ltr');

r = render('---\nname: x\n---\n\n# عنوان\n');
assert.match(r.html, /<details class="frontmatter"[\s\S]*name: x/, 'frontmatter is folded');
assert.ok(!r.html.includes('<hr'), 'frontmatter is not rendered as a rule');

r = render('# عنوان فارسی!\n\n# عنوان فارسی!\n');
assert.match(r.html, /id="عنوان-فارسی"/, 'Persian heading id');
assert.match(r.html, /id="عنوان-فارسی-1"/, 'repeated heading id is unique');

r = render('![a](pic.png) ![b](https://x.y/z.png)', { resolveImage: (s) => (s.startsWith('http') ? s : `R/${s}`) });
assert.match(r.html, /src="R\/pic.png"/, 'relative image is resolved');
assert.match(r.html, /src="https:\/\/x.y\/z.png"/, 'remote image is kept');

r = render('- [x] done\n- [ ] open\n');
assert.match(r.html, /task-list-item-checkbox/, 'task list renders');

r = render('﻿# Hi\n');
assert.match(r.html, /<h1/, 'BOM is ignored');

console.log('render tests passed');
