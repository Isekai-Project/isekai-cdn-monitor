const Core = require('@alicloud/pop-core');

var records = {
    up: {
        "isekai.cn": [{
            record: '1.2.3.4',
            type: 'A',
            subdomain: ['@', 'www', 'bbs']
        }],
        "hyperz.top": [{
            record: '1.2.3.4',
            type: 'A',
            subdomain: ['@', 'www']
        }],
    },
    down: {
        "isekai.cn": [{
            record: 'xxx.cdn.cloudflare.net',
            type: 'CNAME',
            subdomain: '@'
        }, {
            record: 'xxxcdn.cloudflare.net',
            type: 'CNAME',
            subdomain: 'www'
        }, {
            record: 'xxx.cdn.cloudflare.net',
            type: 'CNAME',
            subdomain: 'bbs'
        }],
        "hyperz.top": [{
            record: 'xxx.cdn.cloudflare.net',
            type: 'CNAME',
            subdomain: '@'
        }, {
            record: 'xxx.cdn.cloudflare.net',
            type: 'CNAME',
            subdomain: 'www'
        }],
    }
}

class ModifyDns {
    constructor(){
        //判断掉线的延迟
        this.offlineDelay = 30;
        //监听的domain
        this.domainList = ['www.isekai.cn'];

        this.firstStatusChangeEvent = true;

        this.client = new Core({
            accessKeyId: '<your accesskey id>',
            accessKeySecret: '<your accesskey secret>',
            endpoint: 'https://alidns.aliyuncs.com',
            apiVersion: '2015-01-09'
        });

        this.allowedRecordType = ['A', 'CNAME'];
    }

    onHostUp(domain){
        console.log('host up');
        //this.changeCdn(records.up);
    }

    onHostDown(domain){
        console.log('host down');
        //this.changeCdn(records.down);
    }

    searchRecord(subdomain, records){
        for(let i = 0; i < records.length; i ++){
            let one = records[i];
            if(one.RR == subdomain && this.allowedRecordType.includes(one.Type)){
                return one;
            }
        }
        return false;
    }

    getFullDomain(subdomain, domain){
        if(subdomain == '@'){
            return domain;
        } else {
            return subdomain + '.' + domain;
        }
    }

    async getDnsList(domain){
        try {
            let data = await this.client.request('DescribeDomainRecords', {
                'DomainName': domain,
                'PageSize': 100,
            });
            return data.DomainRecords.Record;
        } catch(e){
            return false;
        }
    }

    async addRecore(domain, subdomain, type, record){
        try {
            await this.client.request('AddDomainRecord', {
                DomainName: domain,
                RR: subdomain,
                Type: type,
                Value: record,
            });
            console.log('+ ' + this.getFullDomain(subdomain, domain) + ' -> ' + record + ' [' + type + ']');
        } catch(e) {
            console.error(this.getFullDomain(subdomain, domain) + ' 添加dns出错: ', e);
        }
    }

    async modifyRecord(domain, subdomain, type, record, recordId){
        try {
            await this.client.request('UpdateDomainRecord', {
                RR: subdomain,
                RecordId: recordId,
                Type: type,
                Value: record,
            });
            console.log(this.getFullDomain(subdomain, domain) + ' -> ' + record + ' [' + type + ']');
        } catch(e) {
            console.error(this.getFullDomain(subdomain, domain) + ' 修改dns出错: ', e);
        }
    }

    async changeCdn(records){
        let modifyRecordQueue = [];
        for(let domain in records){
            let recordList = records[domain];
            let currentRecords = await this.getDnsList(domain);
            for(let i = 0; i < recordList.length; i ++){
                let recordData = recordList[i];
                let subdomainList = recordData.subdomain;
                if(typeof subdomainList == 'string'){
                    subdomainList = [subdomainList];
                }
                
                for(let j = 0; j < subdomainList.length; j ++){
                    let subdomain = subdomainList[j];

                    let currentRecord = this.searchRecord(subdomain, currentRecords);
                    if(currentRecord){
                        if(currentRecord.Type != recordData.type || currentRecord.Value != recordData.record){
                            //修改记录值
                            modifyRecordQueue.push(this.modifyRecord(domain, subdomain, recordData.type, recordData.record, currentRecord.RecordId));
                        } else {
                            console.log(this.getFullDomain(subdomain, domain) + ' 记录未改变');
                        }
                    } else { //添加记录
                        modifyRecordQueue.push(this.addRecore(domain, subdomain, recordData.type, recordData.record));
                    }
                }
            }
        }

        return await Promise.all(modifyRecordQueue);
    }
}

module.exports = ModifyDns;