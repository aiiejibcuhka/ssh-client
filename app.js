const readline = require('readline');
const [node, file, ...execArgs] = process.argv;
const { Client } = require('./client');

const client = new Client(execArgs);

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', (str, key) => {
  // close action
  if (key.ctrl && key.name === 'c') {
    client.closeCommand(key);
  } else if (key.name === 'return') {
    // it does not work if you choose external command from history
    // enter action run external action or regural command
    const action = client.checkCommandAndGetAction();
    if (action) {
      return client.runExternalAction(action, key);
    }
    client.writeCommand(key);
  } else {
    // @TODO: need to resolve "backspace" action to writing command
    // write to child process and save new char to writing command
    const newChar = key.name !== 'backspace' ? str : false;
    client.updateWritingCommand(newChar);
    client.writeCommand(key);
  }
  return;
});

process.stdin.on('end', () => {
  process.stdout.write('end');
});
