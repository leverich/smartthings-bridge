resource "aws_lambda_function" "smartthings_bridge" {
  filename      = "lambda.zip"
  function_name = "smartthings-bridge"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  timeout       = 30

  source_code_hash = filebase64sha256("lambda.zip")

  runtime = "nodejs12.x"
}

resource "aws_iam_role" "lambda" {
  assume_role_policy = <<-EOF
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Action": "sts:AssumeRole",
          "Principal": {
            "Service": "lambda.amazonaws.com"
          },
          "Effect": "Allow",
          "Sid": ""
        }
      ]
    }
  EOF
}

resource "aws_lambda_permission" "allow_samsung" {
  statement_id  = "AllowExecutionBySamsung"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.smartthings_bridge.function_name
  principal     = "arn:aws:iam::906037444270:root"
}

resource "aws_iam_role_policy_attachment" "lambda_cloudwatch_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

output "lambda_arn" {
  value = aws_lambda_function.smartthings_bridge.arn
}
