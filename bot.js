// External libraries
const Discord = require('discord.js')

const client = new Discord.Client()

const auth = require('./auth.json')
const ids = []

client.on('ready', () => {
    console.log(`Connected as ${client.user.tag}`)
})

client.login(auth.token)

client.on('messageReactionAdd', async (reaction, user) => {
    // // To get unicode emoji do `\:emoji:` and paste here
    let user_id = reaction.message.author.id
    let channel = await client.channels.fetch(reaction.message.channel.id)
    let match = ids.find(o => o.user_id === user_id)
    if (reaction.emoji.name === '😄' ){
        // Starting point
        let start_id = reaction.message.id
        if (!match){
            // if we don't find our user ID in there
            ids.push({'start_id':start_id, 'user_id':user_id, 'channel':channel})
        }
        else{
            // user id is in there
            match['start_id'] = start_id
        }
        
    }

    if (reaction.emoji.name === '😢'){
        // End
        let end_id = reaction.message.id
        let user_id = reaction.message.author.id
        if (!match){
            // if we don't find our user ID in there
            ids.push({'end_id':end_id, 'user_id':user_id, 'channel':channel})
        }
        else{
            // user id is in there
            match['end_id'] = end_id
        }
    }
    
    await updateLogs()
    
})

async function filterMessages(first_message, messages, channel){
    // Filter function to check if there are any quotes and multiple lines
    filtered = []
    if (first_message.attachments){
        for (attachment of first_message.attachments){
            let url_string = `\n![](${attachment[1]['url']})`
            filtered.push({'username':first_message.author.username, 'content':url_string, 'timestamp':first_message.createdTimestamp})
        }
    }
    for (message of first_message.content.split('\n')){
        filtered.push({
            'username':first_message.author.username, 
            'content':message, 
            'timestamp':first_message.createdTimestamp
        })
    }

    messages = messages.array()
    for (message of messages){
        if (message.attachments){
            for (attachment of message.attachments){
                let url_string = `\n![](${attachment[1]['url']})`
                filtered.push({
                    'username':first_message.author.username, 
                    'content':url_string, 
                    'timestamp':first_message.createdTimestamp
                })
            }
        }
        for (sub_message of message.content.split('\n')){
            if (message.reference){
                let reference = await channel.messages.fetch(message.reference.messageID)
                let quote = {'username': reference.author.username, 'content': reference.content.substr(0, 101)}
                filtered.push({
                    'username':message.author.username,
                    'content':sub_message,
                    'timestamp':message.createdTimestamp,
                    'quote':quote
                })
            }
            else{
                filtered.push({
                    'username':message.author.username,
                    'content':sub_message,
                    'timestamp':message.createdTimestamp
                })
            }
        }
    }
    filtered.sort((a,b) => a.timestamp - b.timestamp).forEach(function(v){delete v.timestamp})
    return filtered
}

async function updateLogs(){
    // Checks if we have a start_id and end_id on any messages
    // If so copy message, attach as markdown, and send to the user
    // Also pop from array
    // Messages are sent as `summary_month_day_year.md`
    for (let i = 0; i < ids.length; i++){
        let id = ids[i]
        if (id.start_id && id.end_id){
            let message = await buildSummary(id)
            let user = await client.users.fetch(id.user_id)
            let buff = Buffer.from(message)
            let today = new Date()
            let dd = String(today.getDate()).padStart(2, '0')
            let mm = String(today.getMonth() + 1).padStart(2, '0')
            let yyyy = today.getFullYear()
            let attachment = new Discord.MessageAttachment(buff, `summary_${mm}_${dd}_${yyyy}.md`)
            await user.send("Your topic summary is attached!\nYou can now post it to https://forums.fast.ai if you would like", attachment)
            ids.splice(i, 1)
            break
        }
    }
}

async function buildSummary(discussion){
    /*
    Builds a summary based on a discussion object
    Object:
    {
        'start_id',
        'end_id',
        'user_id',
        'channel'
    }

    */
    let new_user=false,code=false
    let first_message = await discussion.channel.messages.fetch(discussion.start_id)
    // remove reaction
    first_message.reactions.resolve('😄').users.remove(discussion.user_id)
    let current_user = first_message.username
    // get all messages after
    let messages = await discussion.channel.messages.fetch({"before":discussion.end_id, "after":discussion.start_id})
    // remove reaction
    messages.last(1)[0].reactions.resolve('😢').users.remove(discussion.user_id)
    messages = await filterMessages(first_message, messages, discussion.channel)
    
    let message = ""
    for (m of messages){
        if (m.username !== current_user){
            message += "___\n"
            new_user = true
        }
        else{
            new_user = false
        }
        current_user = m.username
        if (m.quote){
            message += `\n> Quote from: **${m.quote.username}**\n\t${m.quote.content}\n\n`
        }
        if (new_user){
            message += `<h3>${m.username}:</h3>\n`
        }
        if (m.content.includes('```') && !code){
            message += '\n'
            code = true
        }
        message += `${m.content}\n`
    }
    message += '\n___'
    return message
}