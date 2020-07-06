module.exports = {
    domainList: [
        'www.isekai.cn',
    ], //要检测的域名列表
    outputFile: './cdnStatus.json', //输出的文件，key是域名，value是{delay: 延迟（false表示掉线）, loss: 丢包（百分比）}
    packetSize: 64, //ping包大小
    tryTimes: 4, //ping次数（最终延迟取平均值）
    interval: 20, //每隔n秒查询一次
    hooks: ['./ModifyDns.js'],
}