var argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0 -s [size] -c [char] -f [output path]')
    .number('s')
    .string('c')
    .string('f')
    .demandOption(['s','c', 'f'])
    .argv;
const fs = require('fs');
const path = require('path');
const buff = Buffer.alloc(argv.s, argv.c.charAt(0), 'ascii');

const outputPath = path.join(__dirname, argv.f);
fs.writeFileSync(outputPath, buff.toString('ascii'));