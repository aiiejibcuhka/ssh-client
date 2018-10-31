const { spawn } = require('child_process');
const readline = require('readline');
const [node, file, ...execArgs] = process.argv;

const SCP_ACTIONS = {
  download: 'download',
  upload: 'upload',
};

const EXTERNAL_COMMANDS = {
  get: SCP_ACTIONS.download,
  put: SCP_ACTIONS.upload,
};

class Client {
  constructor(options) {
    this._process = this.connect(options);

    this._process.stdout.on('data', this.stdoutOnData.bind(this));
    this._process.stderr.on('data', this.stderrOnData.bind(this));
    this._process.on('close', this.onClose.bind(this));

    this._writingCommand = '';
    this._logEnabled = true;

    return this;
  }

  /**
   * Write log lines to main rpcess
   * @param {String} line info data
   */
  _log(line) {
    if (this._logEnabled) {
      process.stdout.write(`\n${line}`);
    }
  }

  /**
   * Connect to remote server by ssh
   * @param {Array<string>} options shell argumanrs array
   */
  connect(options) {
    const [_host, ..._hostOptions] = options;
    this._connectionOptions = { _host, _hostOptions };
    
    const connectionOptions = ['-tt'].concat(options);
    return spawn('ssh', connectionOptions);
  }
  
  /**
   * Show data received from remote server and sends it to parent process
   * @param {any} data buffer received from server
   */
  stdoutOnData(data) {
    // I think we can use it, when want to stop enter any new command until current finished
    // readable.resume()
    const response = data.toString().split('\r\n');
    if (!this.isPending) {
      // this._log(`received data ${data.length}`);
      process.stdout.write(data);
    } else if (this.isPending && this.lastComand === 'pwd\n') {
      this._cwd = response[1];
    }
  }
  
  /**
   * Show error received from remote server
   * @param {any} error buffer received from server
   */
  stderrOnData(error) {
    this._log(`${error}`);
  }

  /**
   * Show code received from remote server when it closed
   * @param {number} code number
   */
  onClose(code) {
    this._log(`ssh client has closed ${code}`);
    this._process = undefined;
    process.exit();
  }

  /**
   * Check does send command equal to external action
   * @return {string|undefined} scp action
   */
  _getExternalAction() {
    const pairs = this._writingCommand.split(' ');
    return (pairs && pairs[0] && EXTERNAL_COMMANDS[pairs[0]]);
  }

  /**
   * Sends command to ssh process
   * @param {Object} key keypress object
   */
  writeCommand(key) {
    this._process.stdin.write(key.sequence);
    return this;
  }

  /**
   * try to find file data in received command
   */
  _parseCommandLineAndgetFileName(commandLine) {
    const pairs = commandLine.replace('\n', '').split(' ');
    this._filePath = pairs && pairs[1];
    const filePairs = this._filePath && this._filePath.split('/');
    this._fileName = filePairs && filePairs[filePairs.length - 1];
    return this;
  }

  /**
   * Parse command line, try to get file name and path and check the external action
   * @return {SCP_ACTIONS|undefined}
   */
  checkCommandAndGetAction() {
    const action = this._getExternalAction();
    this._parseCommandLineAndgetFileName(this._writingCommand);
    this._resetWritingCommand();

    return action;
  }

  /**
   * Run scp command to download/unload from in a remote server
   * @param {SCP_ACTIONS} action string
   */
  _runScp(action) {
    const { _host, _hostOptions } = this._connectionOptions;
    const { _cwd, _filePath, _fileName } = this;
    const remotePath = `${_host}:${_cwd}/`;

    const actionOptions = [..._hostOptions];
    if (action === SCP_ACTIONS.download) {
      const remote = remotePath + _filePath;
      actionOptions.push(remote, _fileName);
    } else if (action === SCP_ACTIONS.upload) {
      const remote = remotePath + _fileName;
      actionOptions.push(_filePath, remote);
    }

    const scpProcess = spawn('scp', actionOptions);
    scpProcess.stderr.on('data', (err) => {
      this._log(`${action}ing err: ${err}`);
    });
    scpProcess.on('close', (code) => {
      this._log(`${action}ing finished with code: ${code}`);
      this.isPending = false;
      this._process.stdin.write('\r');
    });
  }

  /**
   * Get cwd. Run external action.
   * @param {SCP_ACTIONS} action string
   * @param {Object} key keypress object
   */
  runExternalAction(action, key) {
    // set flag, that do not show response from server
    this.isPending = true;
    this._cwd = undefined;

    // exec bad command to do command line is empty
    this._process.stdin.write(key.sequence);
    
    // call service command to get cwd and know full path for the scp actions
    this.lastComand = 'pwd\n';
    this._process.stdin.write('pwd\n');

    this._log(`start ${action}ing...`);

    let idleTime = 0;
    const interval = 50;
    const waitLimit = 10000;
    // wait cwd and start downloading
    const timer = setInterval(() => {
      idleTime = idleTime + interval;
      this._log(`idleTime: ${idleTime}`);
      if (idleTime > waitLimit) {
        this._log('Too many time are waitnig, stop download');
        clearInterval(timer);
        this.isPending = false;
        return false;
      }
      if (!this._cwd) return false;

      clearInterval(timer);

      this._runScp(action);
    }, interval);
  }

  /**
   * do _writingCommand is empty
   */
  _resetWritingCommand() {
    this._writingCommand = '';
    return this;
  }
  
  /**
   * add new symbol to writing command
   */
  updateWritingCommand(str) {
    this._writingCommand = this._writingCommand + str;
    return this;
  }

  /**
   * Close REPL command
   * @param {Object} key keypress object
   */
  closeCommand(key) {
    if (client._process) {
      client._process.stdin.write(key.sequence);
    } else {
      process.exit();
    }
  }
}

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
    client.updateWritingCommand(str);
    client.writeCommand(key);
  }
  return;
});

process.stdin.on('end', () => {
  process.stdout.write('end');
});
