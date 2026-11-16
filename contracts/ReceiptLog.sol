// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ReceiptLog {
    // Địa chỉ ví Operator của Server được phép ghi biên lai
    address public immutable operator;
    // Lưu trữ mã băm cuối cùng (h_n) theo từng mã phiên (sessionId)
    mapping(bytes32 => bytes32) public receiptOf;

    // Sự kiện phát ra trên Snowtrace để kiểm chứng công khai
    event SessionReceipt(
        bytes32 indexed sessionId,
        address indexed payer,
        bytes32 receiptHash,
        uint32 chunks,
        uint256 paidUsdc
    );

    constructor() {
        operator = msg.sender;
    }

    // Hàm ghi biên lai cuối phiên họp
    function log(
        bytes32 sessionId,
        address payer,
        bytes32 receiptHash,
        uint32 chunks,
        uint256 paidUsdc
    ) external {
        require(msg.sender == operator, "not operator");
        require(receiptOf[sessionId] == bytes32(0), "exists");
        receiptOf[sessionId] = receiptHash;
        emit SessionReceipt(sessionId, payer, receiptHash, chunks, paidUsdc);
    }
}
