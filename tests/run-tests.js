#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

console.log('=== 精灵图工具测试套件 ===\n');

const testFiles = [
    'server.test.js',
    'frontend.test.js'
];

let exitCode = 0;

async function runTests() {
    for (const file of testFiles) {
        console.log(`\n运行测试: ${file}`);
        console.log('-'.repeat(50));

        const result = spawn('node', ['--test', path.join(__dirname, file)], {
            stdio: 'inherit',
            shell: true
        });

        await new Promise((resolve) => {
            result.on('close', (code) => {
                if (code !== 0) {
                    exitCode = code;
                }
                resolve();
            });
        });
    }

    console.log('\n' + '='.repeat(50));
    if (exitCode === 0) {
        console.log('所有测试通过!');
    } else {
        console.log('部分测试失败');
    }
    process.exit(exitCode);
}

runTests();
