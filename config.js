module.exports = {
    domainList: [
        'static-www.isekai.cn',
        '192.168.0.1',
    ], //要检测的域名列表
    outputFile: './cdnStatus.json', //输出的文件，key是域名，value是{delay: 延迟（false表示掉线）, loss: 丢包（百分比）}
    packetSize: 64, //ping包大小
    tryTimes: 4, //ping次数（最终延迟取平均值）
    interval: 30, //每隔n秒查询一次
}