const { spawn } = require('child_process');
// const fs = require('fs');
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

    this._process.stdin.on('data', this.stdinOnData.bind(this));
    this._process.stdout.on('data', this.stdoutOnData.bind(this));
    this._process.stderr.on('data', this.stderrOnData.bind(this));
    this._process.on('close', this.onClose.bind(this));

    return this;
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
   * Show data wrote on remote server
   * @param {any} data buffer sent to server
   */
  stdinOnData(data) {
    console.log(`stdinOnData: Received ${data.length} bytes of data.`);
    if (!this.isPending) {
      console.log(`stdinOnData: ${data}`);
    }
  }
  
  /**
   * Show data received from remote server and sends it to parent process
   * @param {any} data buffer received from server
   */
  stdoutOnData(data) {
    console.log(`stdoutOnData: Received ${data.length} bytes of data.`);
    const response = data.toString().split('\r\n');
    if (!this.isPending) {
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
    console.log(`stderrOnData: ${error}`);
  }

  /**
   * Show code received from remote server when it closed
   * @param {number} code number
   */
  onClose(code) {
    console.log(`ssh child process exited with code ${code}`);
  }

  /**
   * Check does send command equal to external action
   * @return {string|undefined} scp action
   */
  _getExternalAction() {
    const pairs = this.lastComand.split(' ');
    return (pairs && pairs[0] && EXTERNAL_COMMANDS[pairs[0]]);
  }

  /**
   * Sends command to ssh process
   * @param {buffer} line bufer string
   */
  writeCommand(line) {
    // ignore any command until fisnished scp process
    if (this.isPending) return this;
    this.lastComand = line.toString();
    const action = this._getExternalAction();
    
    if (action) {
      return this.runExternalAction(action);
    }
    
    this._process.stdin.write(line);
    return this;
  }

  /**
   * try to find file data in received command
   */
  _getFileName() {
    const pairs = this.lastComand.replace('\n', '').split(' ');
    this._filePath = pairs && pairs[1];
    const filePairs = this._filePath && this._filePath.split('/');
    this._fileName = filePairs && filePairs[filePairs.length - 1];
    return this;
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
      process.stdout.write(`${action}ing err: ${err}\n`);
    });
    scpProcess.on('close', (code) => {
      process.stdout.write(`${action}ing finished with code: ${code}\n`);
      this.isPending = false;
    });
  }

  /**
   * Get cwd. Run external action.
   * @param {SCP_ACTIONS} action string
   */
  runExternalAction(action) {
    this._getFileName();
    // get cwd
    client.writeCommand('pwd\n');
    
    // set pending action and reset cwd
    this.isPending = true;
    this._cwd = undefined;

    process.stdout.write(`start ${action}ing...\n`);

    let idleTime = 0;
    const interval = 50;
    const waitLimit = 10000;
    // wait cwd and start downloading
    const timer = setInterval(() => {
      idleTime = idleTime + interval;
      console.log('idleTime', idleTime);
      if (idleTime > waitLimit) {
        process.stdout.write('Too many time are waitnig, stop download\n');
        clearInterval(timer);
        this.isPending = false;
        return false;
      }
      if (!this._cwd) return false;

      clearInterval(timer);

      this._runScp(action);
    }, interval);
  }
}

const client = new Client(execArgs);

process.stdin.on('readable', () => {
  const chunk = process.stdin.read();
  if (chunk !== null) {
    client.writeCommand(chunk);
  }
});

process.stdin.on('end', () => {
  process.stdout.write('end');
});
