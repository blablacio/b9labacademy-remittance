pragma solidity 0.5.8;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract Pausable is Ownable {
    bool private paused;
    bool private killed;

    event LogPaused(address who);
    event LogResumed(address who);
    event LogKilled(address who);

    constructor(bool _paused) internal {
        paused = _paused;
        killed = false;
    }

    modifier whenRunning {
        require(paused == false, 'Contract paused');
        _;
    }

    modifier whenPaused {
        require(paused == true, 'Contract not paused');
        _;
    }

    modifier whenAlive {
        require(killed == false, 'Contract killed');
        _;
    }

    function isPaused() public view returns (bool) {
        return paused;
    }

    function pause() public whenAlive whenRunning onlyOwner {
        paused = true;

        emit LogPaused(msg.sender);
    }

    function resume() public whenAlive whenPaused onlyOwner {
        paused = false;

        emit LogResumed(msg.sender);
    }

    function isKilled() public view returns (bool) {
        return killed;
    }

    function kill() public whenPaused whenAlive onlyOwner {
        killed = true;

        emit LogKilled(msg.sender);
    }
}
